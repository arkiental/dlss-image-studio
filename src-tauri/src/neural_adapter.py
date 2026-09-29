"""Independent client for a user-installed Visual Enhancer v13.2.

No reference implementation or runtime binaries are distributed with Studio.
Run in the provider's embedded interpreter, in an isolated subprocess.
"""
import dataclasses
import json
import pathlib
import sys


def main():
    root, job = map(pathlib.Path, sys.argv[1:3])
    sys.path.insert(0, str(root))
    from src.neural_rendering.image import ImageConversionOptions, convert_image

    request = json.loads((job / "request.json").read_text(encoding="utf-8"))
    options = ImageConversionOptions(
        nr_style=request["style"],
        nr_intensity=request["intensity"],
        local_tone_strength=request["tone"],
        local_structure_strength=request["structure"],
        upscaling_factor=1.0,
        nr_passes=1,
        output_format="PNG",
        preserve_metadata=False,
        automatic_mask=False,
    )
    result = convert_image(job / "input.png", options, output_dir=job / "output",
                           generate_previews=False, create_zip=False)
    (job / "result.json").write_text(json.dumps(dataclasses.asdict(result)), encoding="utf-8")


if __name__ == "__main__":
    main()
