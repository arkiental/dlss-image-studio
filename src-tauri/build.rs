fn main() {
    println!("cargo:rerun-if-changed=../native/dlss_backend");
    let shader = std::fs::read_to_string("../native/dlss_backend/src/color.hlsl").unwrap();
    std::fs::write("../native/dlss_backend/src/shader.inc", format!("R\"HLSL({shader})HLSL\"")).unwrap();
    let dst = cmake::Config::new("../native/dlss_backend").profile("Release").build();
    println!("cargo:rustc-link-search=native={}/lib", dst.display());
    println!("cargo:rustc-link-lib=static=studio_backend");
    for lib in ["d3d12", "dxgi", "d3dcompiler", "wintrust", "crypt32", "version"] { println!("cargo:rustc-link-lib={lib}"); }
    tauri_build::build()
}
