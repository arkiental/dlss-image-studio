import { processPixels } from "./processing";
self.onmessage = ({ data }) => {
  const output = processPixels(data.image, data.state);
  self.postMessage(
    { id: data.id, image: output },
    { transfer: [output.data.buffer] },
  );
};
