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
  // Whole-image tone must reach the corners; selected-area mode must not.
  p.brightness = 0;
  p.tone = .7f;
  p.x = .25f; p.y = .25f; p.width = .5f; p.height = .5f;
  p.whole_image = 1;
  if (studio_process(&p, out.data(), out.size())) return 6;
  for (size_t i = 0; i < input.size(); i += 4)
    if (out[i] <= input[i] || out[i + 3] != input[i + 3]) return 7;
  p.whole_image = 0;
  if (studio_process(&p, out.data(), out.size()) || out[0] != 128 ||
      out[(32 * 64 + 32) * 4] <= 128) return 8;
  p.intensity = 0;
  if (studio_process(&p, out.data(), out.size())) return 9;
  for (size_t i = 0; i < input.size(); ++i)
    if (std::abs(int(input[i]) - int(out[i])) > 1) return 10;
  // Structure must affect detail everywhere, independently of inspection position.
  for (size_t i = 0; i < input.size(); i += 4)
    input[i] = input[i + 1] = input[i + 2] = (i / 4 % 2) ? 160 : 80;
  p.whole_image = 1; p.intensity = 1.3f; p.tone = 0; p.structure = 1.6f;
  if (studio_load(input.data(), 64, 64) || studio_process(&p, out.data(), out.size()) ||
      out[0] >= input[0] || out[4] <= input[4]) return 11;
  if (studio_load(nullptr, 0, 0) == 0)
    return 5;
  studio_shutdown();
  std::cout << "D3D12 neutral, brightness, scope, intensity, structure, alpha and invalid-source smoke "
               "checks passed\n";
}
