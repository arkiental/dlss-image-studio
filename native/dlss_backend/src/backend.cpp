#include "backend.h"
#include "sl.h"
#include "sl_security.h"
#include <chrono>
#include <cstring>
#include <d3d12.h>
#include <d3dcompiler.h>
#include <dxgi1_6.h>
#include <filesystem>
#include <fstream>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <vector>
#include <windows.h>
#include <wrl/client.h>
using Microsoft::WRL::ComPtr;
namespace {
std::string lastError, caps;
void check(HRESULT hr, const char *operation) {
  if (FAILED(hr)) {
    std::ostringstream s;
    s << operation << " (HRESULT 0x" << std::hex << uint32_t(hr) << ")";
    throw std::runtime_error(s.str());
  }
}
std::string utf8(const wchar_t *value) {
  int n =
      WideCharToMultiByte(CP_UTF8, 0, value, -1, nullptr, 0, nullptr, nullptr);
  std::string out(n, '\0');
  WideCharToMultiByte(CP_UTF8, 0, value, -1, out.data(), n, nullptr, nullptr);
  out.pop_back();
  return out;
}
std::string escaped(std::string s) {
  std::string out;
  for (char c : s) {
    if (c == '"' || c == '\\')
      out += '\\';
    if (c == '\n') {
      out += "\\n";
      continue;
    }
    out += c;
  }
  return out;
}
std::string fileVersion(const std::filesystem::path &path) {
  DWORD ignored = 0;
  DWORD size = GetFileVersionInfoSizeW(path.c_str(), &ignored);
  if (!size)
    return "unknown";
  std::vector<uint8_t> data(size);
  if (!GetFileVersionInfoW(path.c_str(), 0, size, data.data()))
    return "unknown";
  VS_FIXEDFILEINFO *info = nullptr;
  UINT infoSize = 0;
  if (!VerQueryValueW(data.data(), L"\\", reinterpret_cast<void **>(&info),
                      &infoSize) ||
      !info || infoSize < sizeof(*info))
    return "unknown";
  return std::to_string(HIWORD(info->dwFileVersionMS)) + "." +
         std::to_string(LOWORD(info->dwFileVersionMS)) + "." +
         std::to_string(HIWORD(info->dwFileVersionLS)) + "." +
         std::to_string(LOWORD(info->dwFileVersionLS));
}
struct Backend {
  ComPtr<ID3D12Device> device;
  ComPtr<ID3D12CommandQueue> queue;
  ComPtr<ID3D12CommandAllocator> allocator;
  ComPtr<ID3D12GraphicsCommandList> list;
  ComPtr<ID3D12Fence> fence;
  ComPtr<ID3D12RootSignature> root;
  ComPtr<ID3D12PipelineState> pipeline;
  ComPtr<ID3D12DescriptorHeap> heap;
  ComPtr<ID3D12Resource> source, output, upload, readback;
  HANDLE event = nullptr;
  UINT64 fenceValue = 0;
  uint32_t width = 0, height = 0;
  D3D12_PLACED_SUBRESOURCE_FOOTPRINT footprint{};
  UINT64 bytes = 0;
  HMODULE streamline = nullptr;
  PFun_slShutdown *slShutdown = nullptr;
  bool slInitialized = false;
  bool deviceFailed = false;
  std::ofstream log;
  Backend() {
    wchar_t local[32768]{};
    GetEnvironmentVariableW(L"LOCALAPPDATA", local, 32768);
    auto folder = std::filesystem::path(local) / L"DLSS Image Studio" / L"logs";
    std::filesystem::create_directories(folder);
    log.open(folder / L"studio.log", std::ios::app);
    event = CreateEventW(nullptr, FALSE, FALSE, nullptr);
    if (!event)
      throw std::runtime_error("Cannot create GPU fence event");
  }
  ~Backend() {
    if (slInitialized && slShutdown)
      slShutdown();
    if (streamline)
      FreeLibrary(streamline);
    if (event)
      CloseHandle(event);
  }
  void write(const std::string &s) { log << s << std::endl; }
  void wait() {
    check(queue->Signal(fence.Get(), ++fenceValue), "Signal GPU fence");
    if (fence->GetCompletedValue() < fenceValue) {
      check(fence->SetEventOnCompletion(fenceValue, event), "Set fence event");
      if (WaitForSingleObject(event, 30000) != WAIT_OBJECT_0) {
        deviceFailed = true;
        throw std::runtime_error(
            "D3D12 device timeout; restart the application");
      }
    }
    auto removed = device->GetDeviceRemovedReason();
    if (FAILED(removed))
      deviceFailed = true;
    check(removed, "D3D12 device lost; restart the application");
  }
  void begin() {
    if (deviceFailed)
      throw std::runtime_error(
          "D3D12 device is unavailable; restart the application");
    check(allocator->Reset(), "Reset allocator");
    check(list->Reset(allocator.Get(), nullptr), "Reset command list");
  }
  void submit() {
    check(list->Close(), "Close command list");
    ID3D12CommandList *lists[] = {list.Get()};
    queue->ExecuteCommandLists(1, lists);
    wait();
  }
  void transition(ID3D12Resource *r, D3D12_RESOURCE_STATES before,
                  D3D12_RESOURCE_STATES after) {
    D3D12_RESOURCE_BARRIER b{};
    b.Type = D3D12_RESOURCE_BARRIER_TYPE_TRANSITION;
    b.Transition = {r, D3D12_RESOURCE_BARRIER_ALL_SUBRESOURCES, before, after};
    list->ResourceBarrier(1, &b);
  }
  ComPtr<ID3D12Resource> buffer(UINT64 size, D3D12_HEAP_TYPE type,
                                D3D12_RESOURCE_STATES state) {
    D3D12_HEAP_PROPERTIES hp{};
    hp.Type = type;
    D3D12_RESOURCE_DESC d{};
    d.Dimension = D3D12_RESOURCE_DIMENSION_BUFFER;
    d.Width = size;
    d.Height = 1;
    d.DepthOrArraySize = 1;
    d.MipLevels = 1;
    d.SampleDesc.Count = 1;
    d.Layout = D3D12_TEXTURE_LAYOUT_ROW_MAJOR;
    ComPtr<ID3D12Resource> r;
    check(device->CreateCommittedResource(&hp, D3D12_HEAP_FLAG_NONE, &d, state,
                                          nullptr, IID_PPV_ARGS(&r)),
          "Allocate GPU staging buffer");
    return r;
  }
  void initialize() {
    std::string slStatus = "Not installed",
                nrStatus = "Unavailable: public NR plugin/API missing";
    wchar_t exe[32768]{};
    GetModuleFileNameW(nullptr, exe, 32768);
    auto pluginDir = std::filesystem::path(exe).parent_path() / L"streamline";
    auto interposer = pluginDir / L"sl.interposer.dll";
    if (std::filesystem::exists(interposer)) {
      if (!sl::security::verifyEmbeddedSignature(interposer.c_str()))
        slStatus = "Rejected: NVIDIA signature verification failed";
      else {
        streamline = LoadLibraryExW(interposer.c_str(), nullptr,
                                    LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR |
                                        LOAD_LIBRARY_SEARCH_SYSTEM32);
        if (streamline) {
          auto init = reinterpret_cast<PFun_slInit *>(
              GetProcAddress(streamline, "slInit"));
          slShutdown = reinterpret_cast<PFun_slShutdown *>(
              GetProcAddress(streamline, "slShutdown"));
          if (init && slShutdown) {
            sl::Preferences p{};
            auto directory = pluginDir.wstring();
            const wchar_t *paths[] = {directory.c_str()};
            p.pathsToPlugins = paths;
            p.numPathsToPlugins = 1;
            p.engineVersion = "0.1.0";
            p.projectId = "be8c56a2-d3f7-4820-b5e4-8d71d427cc4d";
            p.flags = sl::PreferenceFlags::eDisableCLStateTracking;
            auto result = init(p, sl::kSDKVersion);
            slInitialized = result == sl::Result::eOk;
            slStatus =
                slInitialized
                    ? "Initialized runtime " + fileVersion(interposer) +
                          " (SDK headers 2.14.1)"
                    : "Initialization error " + std::to_string(int(result));
          }
        } else
          slStatus = "LoadLibraryEx failed";
      }
    }
    write("[STREAMLINE] " + slStatus);
#ifndef NDEBUG
    ComPtr<ID3D12Debug> debug;
    if (SUCCEEDED(D3D12GetDebugInterface(IID_PPV_ARGS(&debug))))
      debug->EnableDebugLayer();
#endif
    ComPtr<IDXGIFactory6> factory;
    check(CreateDXGIFactory2(0, IID_PPV_ARGS(&factory)), "Create DXGI factory");
    ComPtr<IDXGIAdapter1> adapter, best;
    DXGI_ADAPTER_DESC1 desc{};
    for (UINT i = 0;; ++i) {
      auto enumerated = factory->EnumAdapterByGpuPreference(
          i, DXGI_GPU_PREFERENCE_HIGH_PERFORMANCE, IID_PPV_ARGS(&adapter));
      if (enumerated == DXGI_ERROR_NOT_FOUND)
        break;
      check(enumerated, "Enumerate DXGI adapter");
      DXGI_ADAPTER_DESC1 d{};
      adapter->GetDesc1(&d);
      if (d.Flags & DXGI_ADAPTER_FLAG_SOFTWARE)
        continue;
      if (SUCCEEDED(D3D12CreateDevice(adapter.Get(), D3D_FEATURE_LEVEL_11_0,
                                      __uuidof(ID3D12Device), nullptr))) {
        if (!best || d.VendorId == 0x10de) {
          best = adapter;
          desc = d;
          if (d.VendorId == 0x10de)
            break;
        }
      }
    }
    if (!best)
      throw std::runtime_error("No D3D12-capable GPU was found");
    LARGE_INTEGER version{};
    best->CheckInterfaceSupport(__uuidof(IDXGIDevice), &version);
    std::ostringstream driver;
    driver << HIWORD(version.HighPart) << '.' << LOWORD(version.HighPart) << '.'
           << HIWORD(version.LowPart) << '.' << LOWORD(version.LowPart);
    if (slInitialized) {
      auto support = reinterpret_cast<PFun_slIsFeatureSupported *>(
          GetProcAddress(streamline, "slIsFeatureSupported"));
      if (support) {
        sl::AdapterInfo info{};
        info.deviceLUID = reinterpret_cast<uint8_t *>(&desc.AdapterLuid);
        info.deviceLUIDSizeInBytes = sizeof(desc.AdapterLuid);
        auto result = support(sl::kFeatureDLSS_NR, info);
        nrStatus = "Not executed; NR support query result " +
                   std::to_string(int(result));
        write("[DLSS5] slIsFeatureSupported(kFeatureDLSS_NR): " +
              std::to_string(int(result)));
      }
    }
    check(D3D12CreateDevice(best.Get(), D3D_FEATURE_LEVEL_11_0,
                            IID_PPV_ARGS(&device)),
          "Create D3D12 device");
    device->SetName(L"Studio D3D12 device");
    if (slInitialized) {
      auto set = reinterpret_cast<PFun_slSetD3DDevice *>(
          GetProcAddress(streamline, "slSetD3DDevice"));
      if (set)
        write("[STREAMLINE] slSetD3DDevice: " +
              std::to_string(int(set(device.Get()))));
    }
    D3D12_COMMAND_QUEUE_DESC q{};
    q.Type = D3D12_COMMAND_LIST_TYPE_DIRECT;
    check(device->CreateCommandQueue(&q, IID_PPV_ARGS(&queue)),
          "Create GPU queue");
    queue->SetName(L"Studio processing queue");
    check(device->CreateCommandAllocator(q.Type, IID_PPV_ARGS(&allocator)),
          "Create command allocator");
    check(device->CreateCommandList(0, q.Type, allocator.Get(), nullptr,
                                    IID_PPV_ARGS(&list)),
          "Create command list");
    list->SetName(L"Studio color processing");
    check(list->Close(), "Close initial list");
    check(device->CreateFence(0, D3D12_FENCE_FLAG_NONE, IID_PPV_ARGS(&fence)),
          "Create fence");
    D3D12_DESCRIPTOR_HEAP_DESC hd{};
    hd.Type = D3D12_DESCRIPTOR_HEAP_TYPE_CBV_SRV_UAV;
    hd.NumDescriptors = 2;
    hd.Flags = D3D12_DESCRIPTOR_HEAP_FLAG_SHADER_VISIBLE;
    check(device->CreateDescriptorHeap(&hd, IID_PPV_ARGS(&heap)),
          "Create descriptors");
    D3D12_DESCRIPTOR_RANGE ranges[2]{};
    ranges[0] = {D3D12_DESCRIPTOR_RANGE_TYPE_SRV, 1, 0, 0, 0};
    ranges[1] = {D3D12_DESCRIPTOR_RANGE_TYPE_UAV, 1, 0, 0, 1};
    D3D12_ROOT_PARAMETER params[2]{};
    params[0].ParameterType = D3D12_ROOT_PARAMETER_TYPE_DESCRIPTOR_TABLE;
    params[0].DescriptorTable = {2, ranges};
    params[1].ParameterType = D3D12_ROOT_PARAMETER_TYPE_32BIT_CONSTANTS;
    params[1].Constants = {0, 0, 16};
    D3D12_ROOT_SIGNATURE_DESC rd{};
    rd.NumParameters = 2;
    rd.pParameters = params;
    ComPtr<ID3DBlob> signature, error;
    check(D3D12SerializeRootSignature(&rd, D3D_ROOT_SIGNATURE_VERSION_1,
                                      &signature, &error),
          "Serialize root signature");
    check(device->CreateRootSignature(0, signature->GetBufferPointer(),
                                      signature->GetBufferSize(),
                                      IID_PPV_ARGS(&root)),
          "Create root signature");
    const char *shader =
#include "shader.inc"
        ;
    ComPtr<ID3DBlob> code;
    auto hr = D3DCompile(shader, strlen(shader), "Studio color.hlsl", nullptr,
                         nullptr, "main", "cs_5_0",
                         D3DCOMPILE_OPTIMIZATION_LEVEL3, 0, &code, &error);
    if (FAILED(hr)) {
      write(error ? std::string(static_cast<char *>(error->GetBufferPointer()),
                                error->GetBufferSize())
                  : "Shader compilation failed");
      check(hr, "Compile color shader");
    }
    D3D12_COMPUTE_PIPELINE_STATE_DESC pd{};
    pd.pRootSignature = root.Get();
    pd.CS = {code->GetBufferPointer(), code->GetBufferSize()};
    check(device->CreateComputePipelineState(&pd, IID_PPV_ARGS(&pipeline)),
          "Create compute pipeline");
    const auto gpuName = utf8(desc.Description);
    std::string gpuFamily = desc.VendorId == 0x10de
                                ? "NVIDIA, generation unknown"
                                : "Non-NVIDIA adapter";
    for (const auto *family : {"RTX 50", "RTX 40", "RTX 30", "RTX 20"})
      if (gpuName.find(family) != std::string::npos)
        gpuFamily = std::string(family) + " series (name-based identification)";
    caps = "{\"gpu\":\"" + escaped(gpuName) + "\",\"gpu_family\":\"" +
           escaped(gpuFamily) + "\",\"driver\":\"" + driver.str() +
           "\",\"vram_mb\":" +
           std::to_string(desc.DedicatedVideoMemory / 1048576) +
           ",\"d3d12\":true,\"streamline\":\"" + escaped(slStatus) +
           "\",\"neural_rendering\":\"" + escaped(nrStatus) +
           "\",\"detail\":\"Streamline 2.14.1 declares kFeatureDLSS_NR but its "
           "public package lacks sl.dlss_nr.dll, the NR parameter header, and "
           "a still-image integration contract. Application adjustments use "
           "D3D12; DLSS 5 has not executed.\"}";
    write("[D3D12] GPU: " + utf8(desc.Description) +
          " Driver: " + driver.str());
    write("[DLSS5] Evaluation: NOT EXECUTED - NR API/plugin unavailable");
  }
  void load(const uint8_t *rgba, uint32_t w, uint32_t h) {
    if (!rgba || !w || !h || w > 16384 || h > 16384 ||
        uint64_t(w) * h > 64000000)
      throw std::runtime_error(
          "Invalid image dimensions (maximum 64 megapixels / 16384 per side)");
    width = w;
    height = h;
    D3D12_RESOURCE_DESC d{};
    d.Dimension = D3D12_RESOURCE_DIMENSION_TEXTURE2D;
    d.Width = w;
    d.Height = h;
    d.DepthOrArraySize = 1;
    d.MipLevels = 1;
    d.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
    d.SampleDesc.Count = 1;
    D3D12_HEAP_PROPERTIES hp{};
    hp.Type = D3D12_HEAP_TYPE_DEFAULT;
    source.Reset();
    output.Reset();
    check(device->CreateCommittedResource(&hp, D3D12_HEAP_FLAG_NONE, &d,
                                          D3D12_RESOURCE_STATE_COPY_DEST,
                                          nullptr, IID_PPV_ARGS(&source)),
          "Allocate source texture");
    source->SetName(L"Studio immutable sRGB source");
    d.Flags = D3D12_RESOURCE_FLAG_ALLOW_UNORDERED_ACCESS;
    check(device->CreateCommittedResource(&hp, D3D12_HEAP_FLAG_NONE, &d,
                                          D3D12_RESOURCE_STATE_UNORDERED_ACCESS,
                                          nullptr, IID_PPV_ARGS(&output)),
          "Allocate output texture");
    output->SetName(L"Studio sRGB output");
    device->GetCopyableFootprints(&d, 0, 1, 0, &footprint, nullptr, nullptr,
                                  &bytes);
    upload = buffer(bytes, D3D12_HEAP_TYPE_UPLOAD,
                    D3D12_RESOURCE_STATE_GENERIC_READ);
    readback =
        buffer(bytes, D3D12_HEAP_TYPE_READBACK, D3D12_RESOURCE_STATE_COPY_DEST);
    void *mapped = nullptr;
    D3D12_RANGE empty{0, 0};
    check(upload->Map(0, &empty, &mapped), "Map upload buffer");
    for (uint32_t y = 0; y < h; y++)
      memcpy(static_cast<uint8_t *>(mapped) + y * footprint.Footprint.RowPitch,
             rgba + uint64_t(y) * w * 4, w * 4);
    upload->Unmap(0, nullptr);
    begin();
    D3D12_TEXTURE_COPY_LOCATION from{}, to{};
    from.pResource = upload.Get();
    from.Type = D3D12_TEXTURE_COPY_TYPE_PLACED_FOOTPRINT;
    from.PlacedFootprint = footprint;
    to.pResource = source.Get();
    to.Type = D3D12_TEXTURE_COPY_TYPE_SUBRESOURCE_INDEX;
    list->CopyTextureRegion(&to, 0, 0, 0, &from, nullptr);
    transition(source.Get(), D3D12_RESOURCE_STATE_COPY_DEST,
               D3D12_RESOURCE_STATE_NON_PIXEL_SHADER_RESOURCE);
    submit();
    auto cpu = heap->GetCPUDescriptorHandleForHeapStart();
    D3D12_SHADER_RESOURCE_VIEW_DESC srv{};
    srv.Format = d.Format;
    srv.ViewDimension = D3D12_SRV_DIMENSION_TEXTURE2D;
    srv.Shader4ComponentMapping = D3D12_DEFAULT_SHADER_4_COMPONENT_MAPPING;
    srv.Texture2D.MipLevels = 1;
    device->CreateShaderResourceView(source.Get(), &srv, cpu);
    cpu.ptr += device->GetDescriptorHandleIncrementSize(
        D3D12_DESCRIPTOR_HEAP_TYPE_CBV_SRV_UAV);
    D3D12_UNORDERED_ACCESS_VIEW_DESC uav{};
    uav.Format = d.Format;
    uav.ViewDimension = D3D12_UAV_DIMENSION_TEXTURE2D;
    device->CreateUnorderedAccessView(output.Get(), nullptr, &uav, cpu);
    write("[IMAGE] Source loaded; temporal history is unused because NR is "
          "unavailable");
  }
  void process(const StudioParams &p, uint8_t *out, uint64_t size) {
    const auto started = std::chrono::steady_clock::now();
    if (!source || !out || size != uint64_t(width) * height * 4)
      throw std::runtime_error("Source image is not ready");
    struct Constants {
      StudioParams p;
      uint32_t w, h;
    } constants{p, width, height};
    static_assert(sizeof(constants) == 64);
    begin();
    list->SetPipelineState(pipeline.Get());
    list->SetComputeRootSignature(root.Get());
    ID3D12DescriptorHeap *heaps[] = {heap.Get()};
    list->SetDescriptorHeaps(1, heaps);
    list->SetComputeRootDescriptorTable(
        0, heap->GetGPUDescriptorHandleForHeapStart());
    list->SetComputeRoot32BitConstants(1, 16, &constants, 0);
    list->Dispatch((width + 7) / 8, (height + 7) / 8, 1);
    transition(output.Get(), D3D12_RESOURCE_STATE_UNORDERED_ACCESS,
               D3D12_RESOURCE_STATE_COPY_SOURCE);
    D3D12_TEXTURE_COPY_LOCATION from{}, to{};
    from.pResource = output.Get();
    from.Type = D3D12_TEXTURE_COPY_TYPE_SUBRESOURCE_INDEX;
    to.pResource = readback.Get();
    to.Type = D3D12_TEXTURE_COPY_TYPE_PLACED_FOOTPRINT;
    to.PlacedFootprint = footprint;
    list->CopyTextureRegion(&to, 0, 0, 0, &from, nullptr);
    transition(output.Get(), D3D12_RESOURCE_STATE_COPY_SOURCE,
               D3D12_RESOURCE_STATE_UNORDERED_ACCESS);
    submit();
    void *mapped = nullptr;
    D3D12_RANGE range{0, SIZE_T(bytes)};
    check(readback->Map(0, &range, &mapped), "Read processed texture");
    for (uint32_t y = 0; y < height; y++)
      memcpy(out + uint64_t(y) * width * 4,
             static_cast<uint8_t *>(mapped) + y * footprint.Footprint.RowPitch,
             width * 4);
    D3D12_RANGE empty{0, 0};
    readback->Unmap(0, &empty);
    const auto ms = std::chrono::duration<double, std::milli>(
                        std::chrono::steady_clock::now() - started)
                        .count();
    write("[D3D12] Application color compute executed: " +
          std::to_string(width) + "x" + std::to_string(height) +
          "; dispatch and readback " + std::to_string(ms) + " ms");
  }
};
std::unique_ptr<Backend> backend;
template <class F> int guard(F f) {
  try {
    f();
    lastError.clear();
    return 0;
  } catch (const std::exception &e) {
    lastError = e.what();
    if (backend)
      backend->write("[APP] " + lastError);
    return -1;
  } catch (...) {
    lastError = "Unexpected native backend error";
    return -1;
  }
}
} // namespace
extern "C" int studio_initialize() {
  return guard([] {
    auto next = std::make_unique<Backend>();
    next->initialize();
    backend = std::move(next);
  });
}
extern "C" const char *studio_capabilities() { return caps.c_str(); }
extern "C" const char *studio_error() { return lastError.c_str(); }
extern "C" int studio_load(const uint8_t *rgba, uint32_t w, uint32_t h) {
  return guard([&] {
    if (!backend)
      throw std::runtime_error("D3D12 unavailable");
    backend->load(rgba, w, h);
  });
}
extern "C" int studio_process(const StudioParams *p, uint8_t *out,
                              uint64_t size) {
  return guard([&] {
    if (!backend || !p)
      throw std::runtime_error("D3D12 unavailable");
    backend->process(*p, out, size);
  });
}
extern "C" void studio_shutdown() { backend.reset(); }
