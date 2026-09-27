fn main() {
    println!("cargo:rerun-if-changed=../native/dlss_backend");
    let profile = if std::env::var("PROFILE").as_deref() == Ok("debug") {
        "Debug"
    } else {
        "Release"
    };
    let dst = cmake::Config::new("../native/dlss_backend")
        .profile(profile)
        .build();
    println!("cargo:rustc-link-search=native={}/lib", dst.display());
    println!("cargo:rustc-link-lib=static=studio_backend");
    for lib in [
        "d3d12",
        "dxgi",
        "d3dcompiler",
        "wintrust",
        "crypt32",
        "version",
    ] {
        println!("cargo:rustc-link-lib={lib}");
    }
    tauri_build::build()
}
