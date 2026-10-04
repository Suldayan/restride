import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np

from processing.smoothing import smooth
from processing.stride_detect import detect_strides

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("restride.api")

app = FastAPI()

ALLOWED_ORIGINS = [
    "https://restridetest.netlify.app",
    "https://restride.netlify.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_cors_requests(request: Request, call_next):
    origin = request.headers.get("origin")
    is_preflight = (
        request.method == "OPTIONS"
        and "access-control-request-method" in request.headers
    )

    if origin:
        logger.info(
            "CORS request received method=%s path=%s origin=%s preflight=%s",
            request.method,
            request.url.path,
            origin,
            is_preflight,
        )

    try:
        response = await call_next(request)
    except Exception:
        if origin:
            logger.exception(
                "CORS request failed method=%s path=%s origin=%s",
                request.method,
                request.url.path,
                origin,
            )
        raise

    if origin:
        logger.info(
            "CORS response method=%s path=%s origin=%s status=%s "
            "allow_origin=%s",
            request.method,
            request.url.path,
            origin,
            response.status_code,
            response.headers.get("access-control-allow-origin", "<missing>"),
        )
    return response


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
        logger.info("Trial processing completed status=empty sample_count=0")
        return {"sampleCount": 0, "status": "empty trial"}

    sample_count = len(trial.samples)
    logger.info("Trial processing started sample_count=%s", sample_count)

    t = np.array([s.t for s in trial.samples])
    pitch = np.array([s.pitch for s in trial.samples])
    roll = np.array([s.roll for s in trial.samples])
    yaw = np.array([s.yaw for s in trial.samples])
    accel_mag = np.array([s.accelMag for s in trial.samples])

    try:
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
            for i in range(sample_count)
        ]
    except Exception:
        logger.exception(
            "Trial processing failed sample_count=%s",
            sample_count,
        )
        raise

    logger.info(
        "Trial processing completed status=processed sample_count=%s "
        "stride_count=%s cadence_steps_per_min=%s",
        sample_count,
        stride_info["strideCount"],
        stride_info["cadenceStepsPerMin"],
    )

    return {
        "sampleCount": sample_count,
        "status": "processed",
        "strideCount": stride_info["strideCount"],
        "cadenceStepsPerMin": stride_info["cadenceStepsPerMin"],
        "samples": cleaned_samples,
    }