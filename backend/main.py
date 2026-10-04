from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()


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
    return {
        "sampleCount": len(trial.samples),
        "status": "received"
    }