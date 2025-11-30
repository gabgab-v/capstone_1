import argparse
import json
import os
import sys

import cv2
from deepface import DeepFace
import numpy as np


def read_image(path: str):
  if not path or not os.path.exists(path):
    raise FileNotFoundError(f"File not found: {path}")
  img = cv2.imread(path)
  if img is None:
    raise ValueError(f"Unable to read image: {path}")
  return img


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
  denom = (np.linalg.norm(a) * np.linalg.norm(b)) or 1e-6
  return float(np.dot(a, b) / denom)


def get_embedding(img_path: str):
  reps = DeepFace.represent(
    img_path=img_path,
    model_name="ArcFace",
    enforce_detection=True,
    detector_backend="retinaface",
  )
  if not reps or not isinstance(reps, list):
    raise ValueError("No embedding returned")
  return np.array(reps[0]["embedding"])


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument("--id", dest="id_image", required=True, help="Path to ID image")
  parser.add_argument("--selfie", dest="selfie_image", required=True, help="Path to selfie image")
  args = parser.parse_args()

  try:
    id_embedding = get_embedding(args.id_image)
    selfie_embedding = get_embedding(args.selfie_image)
    score = cosine_similarity(id_embedding, selfie_embedding)

    # Optional OCR placeholder (not implemented here; add Tesseract if needed)
    response = {
      "face_match_score": round(score, 4),
      "ocr": None,
    }
    print(json.dumps(response))
  except Exception as exc:
    print(json.dumps({"error": str(exc)}))
    sys.exit(1)


if __name__ == "__main__":
  main()
