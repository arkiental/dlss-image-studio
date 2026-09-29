import { finishBrowser } from "./finishBrowser";
self.onmessage = ({ data }) => {
  try {
    const output = finishBrowser(data.image, data.state, data.lut);
    self.postMessage(
      { id: data.id, key: data.key, sourceUrl: data.sourceUrl, image: output },
      { transfer: [output.data.buffer] },
    );
  } catch (error) {
    self.postMessage({ id: data.id, key: data.key, error: String(error) });
  }
};
