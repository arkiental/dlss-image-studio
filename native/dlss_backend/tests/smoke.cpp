#include "backend.h"
#include <cmath>
#include <iostream>
#include <vector>
int main() {
  if (studio_initialize() != 0) {
    std::cerr << studio_error();
    return 1;
  }
  std::cout << studio_capabilities() << '\n';
  std::vector<uint8_t> input(64 * 64 * 4, 128), out(input.size());
  for (size_t i = 3; i < input.size(); i += 4)
    input[i] = 255;
  StudioParams p{};
  p.intensity = 1.3f;
  p.structure = .8f;
  p.width = 1;
  p.height = 1;
  if (studio_load(input.data(), 64, 64) ||
      studio_process(&p, out.data(), out.size())) {
    std::cerr << studio_error();
    return 2;
  }
  for (size_t i = 0; i < input.size(); i++)
    if (std::abs(int(input[i]) - int(out[i])) > 1)
      return 3;
  p.brightness = 30;
  if (studio_process(&p, out.data(), out.size()) || out[0] <= 128)
    return 4;
  if (studio_load(nullptr, 0, 0) == 0)
    return 5;
  studio_shutdown();
  std::cout << "D3D12 neutral, brightness, alpha and invalid-source smoke "
               "checks passed\n";
}
