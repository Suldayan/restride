from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np

from processing.smoothing import smooth
from processing.stride_detect import detect_strides

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://restridetest.netlify.app",
        "https://restride.netlify.app",
    ],
    allow_methods=["POST"],
    allow_headers=["*"],
)


class Sample(BaseModel):
    t: float
    pitch: float
    roll: float
    yaw: float
    accelMag: float


class Trial(BaseModel):
    samples: list[Sample]


@app.get("/")
def root():
    return {"status": "ReStride backend running"}


@app.post("/process-trial")
def process_trial(trial: Trial):
    if len(trial.samples) == 0:
        return {"sampleCount": 0, "status": "empty trial"}

    t = np.array([s.t for s in trial.samples])
    pitch = np.array([s.pitch for s in trial.samples])
    roll = np.array([s.roll for s in trial.samples])
    yaw = np.array([s.yaw for s in trial.samples])
    accel_mag = np.array([s.accelMag for s in trial.samples])

    smoothed_pitch = smooth(pitch)
    smoothed_roll = smooth(roll)
    smoothed_yaw = smooth(yaw)

    stride_info = detect_strides(t, accel_mag)

    cleaned_samples = [
        {
            "t": float(t[i]),
            "pitch": float(smoothed_pitch[i]),
            "roll": float(smoothed_roll[i]),
            "yaw": float(smoothed_yaw[i]),
            "accelMag": float(accel_mag[i]),
        }
        for i in range(len(t))
    ]

    return {
        "sampleCount": len(trial.samples),
        "status": "processed",
        "strideCount": stride_info["strideCount"],
        "cadenceStepsPerMin": stride_info["cadenceStepsPerMin"],
        "samples": cleaned_samples,
    }