import { processPixels } from "./processing";
self.onmessage = ({ data }) => {
  const output = processPixels(data.image, data.state);
  self.postMessage(
    { id: data.id, key: data.key, sourceUrl: data.sourceUrl, image: output },
    { transfer: [output.data.buffer] },
  );
};
