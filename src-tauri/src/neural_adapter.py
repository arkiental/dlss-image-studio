"""Original persistent client for separately installed Visual Enhancer v13.2.
No provider code or binaries are bundled. Protocol: JSON line, then RGBA bytes.
"""
import json
import pathlib
import sys
import time


def main():
    sys.path.insert(0, str(pathlib.Path(sys.argv[1])))
    wire = sys.stdout.buffer
    sys.stdout = sys.stderr  # Keep provider messages out of the binary protocol.
    import cv2
    import numpy as np
    from src.core.runtime import prepare_runtime, resolve_native_settings, DLSSFrameSession, UPSCALING_MODES
    from src.core.jobs import JobController
    from src.neural_rendering.image import ImageConversionOptions

    prepared = None
    session = None
    source = None
    prepared_input = None
    input_key = None
    frame = 0
    try:
        while line := sys.stdin.buffer.readline():
            start = time.perf_counter()
            try:
                request = json.loads(line)
                w, h = request['width'], request['height']
                if request['source_bytes']:
                    raw = bytearray(request['source_bytes'])
                    view = memoryview(raw)
                    offset = 0
                    while offset < len(raw):
                        count = sys.stdin.buffer.readinto(view[offset:])
                        if not count:
                            raise EOFError('Incomplete source pixels')
                        offset += count
                    source = np.frombuffer(raw, dtype=np.uint8).reshape(h, w, 4)
                    input_key = None
                if source is None or source.shape != (h, w, 4):
                    raise ValueError('Missing current source')
                controls = request['controls']
                sw, sh = request['small_width'], request['small_height']
                pw, ph = max(128, (sw + 1) // 2 * 2), max(128, (sh + 1) // 2 * 2)
                if input_key != (sw, sh):
                    small = source if (sw, sh) == (w, h) else cv2.resize(source, (sw, sh), interpolation=cv2.INTER_AREA)
                    prepared_input = cv2.copyMakeBorder(small, 0, ph-sh, 0, pw-sw, cv2.BORDER_REPLICATE)
                    input_key = (sw, sh)
                options = ImageConversionOptions(nr_style=controls['style'], nr_intensity=controls['intensity'],
                    local_tone_strength=controls['tone'], local_structure_strength=controls['structure'])
                settings = resolve_native_settings(options)
                if prepared is None:
                    prepared = prepare_runtime()
                if session is None or (session.output_width, session.output_height) != (pw, ph):
                    if session is not None:
                        session.close()
                    session = DLSSFrameSession(input_width=pw, input_height=ph, output_width=pw, output_height=ph,
                        frame_count=None, warmup_frames=0, factor=1.0, mode=UPSCALING_MODES[1.0],
                        native_settings=settings, gpu=prepared.gpu, runtime_bundle=prepared.runtime_bundle,
                        controller=JobController())
                    frame = 0
                # v13.2 keeps a separate host-path settings dictionary. Update both
                # between evaluations; no recreation of the neural feature is needed.
                session.native_settings.update(settings)
                session._host_bridge_settings.update(settings)
                evaluation_start = time.perf_counter()
                output, _ = session.process(index=frame, rgba=prepared_input, reset=True, pts=frame)
                evaluation_ms = (time.perf_counter() - evaluation_start) * 1000
                frame += 1
                output = output[:sh, :sw]
                if (sw, sh) != (w, h):
                    output = cv2.resize(output, (w, h), interpolation=cv2.INTER_LANCZOS4)
                output[..., 3] = source[..., 3]
                output = np.ascontiguousarray(output)
                # structured_status also samples VRAM; avoid a subprocess per frame.
                diagnostic = dict(session.bridge_status)
                diagnostic.update(session.diagnostics.as_dict())
                diagnostic['evaluation_ms'] = evaluation_ms
                diagnostic['adapter_ms'] = (time.perf_counter() - start) * 1000
                diagnostic['processing_resolution'] = controls['resolution']
                response = {'bytes': output.nbytes, 'bridge_status': diagnostic}
                wire.write(json.dumps(response).encode() + b'\n')
                wire.write(memoryview(output).cast('B'))
                wire.flush()
            except Exception as error:
                wire.write(json.dumps({'bytes': 0, 'error': f'{type(error).__name__}: {error}'}).encode() + b'\n')
                wire.flush()
                break  # Discard a possibly poisoned provider; never substitute pixels.
    finally:
        if session is not None:
            session.close()


if __name__ == '__main__':
    main()
