import { overlayBrowser } from "./finishBrowser";
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ image: overlayBrowser(data.image, data.state) });
  } catch (e) {
    self.postMessage({ error: String(e) });
  }
};
