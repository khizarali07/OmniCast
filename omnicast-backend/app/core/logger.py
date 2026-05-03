import logging
import colorlog

_HANDLER = colorlog.StreamHandler()
_HANDLER.setFormatter(
    colorlog.ColoredFormatter(
        fmt="%(log_color)s%(asctime)s [%(levelname)s] %(name)s: %(message)s%(reset)s",
        datefmt="%H:%M:%S",
        log_colors={
            "DEBUG":    "cyan",
            "INFO":     "green",
            "WARNING":  "yellow",
            "ERROR":    "red",
            "CRITICAL": "bold_red",
        },
        secondary_log_colors={
            "message": {
                "ERROR":    "red",
                "CRITICAL": "bold_red",
            }
        },
    )
)


def get_logger(name: str) -> logging.Logger:
    """Return a colorized logger for the given module name."""
    logger = logging.getLogger(name)
    if not logger.handlers:
        logger.addHandler(_HANDLER)
    logger.setLevel(logging.DEBUG)
    logger.propagate = False
    return logger
