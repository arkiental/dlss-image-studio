#pragma once
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
typedef struct StudioParams {
  float contrast, gamma, vibrance, brightness, saturation, hue, intensity, tone,
      structure, x, y, width, height, whole_image;
} StudioParams;
int studio_initialize(void);
const char *studio_capabilities(void);
const char *studio_error(void);
int studio_load(const uint8_t *rgba, uint32_t width, uint32_t height);
int studio_process(const StudioParams *params, uint8_t *output, uint64_t size);
void studio_shutdown(void);
#ifdef __cplusplus
}
#endif
