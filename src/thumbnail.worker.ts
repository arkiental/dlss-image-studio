import type { Lut } from "./lut";
import { finishBrowser } from "./finishBrowser";
import { finishDefaults } from "./finish";
import type { StudioState } from "./state";
self.onmessage = ({
  data,
}: MessageEvent<{
  image: ImageData;
  luts?: Record<string, Lut>;
  items: { id: string; state: StudioState }[];
}>) => {
  for (const item of data.items) {
    try {
      const state = structuredClone(item.state);
      // These are explicitly labelled grading previews. A thumbnail never claims
      // to have run the separately installed neural provider.
      state.neural.enabled = false;
      state.finish = {
        ...state.finish,
        masks: [],
        masked: false,
        soloPass: "",
        depthPass: "",
        dof: 0,
        fog: 0,
        crop: finishDefaults().crop,
        rotation: 0,
        flipX: false,
        flipY: false,
      };
      self.postMessage({
        id: item.id,
        image: finishBrowser(data.image, state, data.luts?.[item.id]),
      });
    } catch {
      /* A preset requiring native passes has no grading thumbnail. */
    }
  }
};
