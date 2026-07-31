import argparse
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Create a grayscale garment mask with rembg.")
    parser.add_argument("source")
    parser.add_argument("destination")
    parser.add_argument("--model", default="isnet-general-use")
    args = parser.parse_args()

    try:
        from rembg import new_session, remove
    except ImportError as error:
        raise SystemExit(
            "rembg is not installed. Install requirements.txt before starting Wardrobe."
        ) from error

    source = Path(args.source).read_bytes()
    session = new_session(args.model)
    mask = remove(source, session=session, only_mask=True, post_process_mask=True)
    Path(args.destination).write_bytes(mask)


if __name__ == "__main__":
    main()
