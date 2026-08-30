import logging
import grid2op
from lightsim2grid import LightSimBackend
env, obs = None, None

def get_env():
    """ Assigns the environment and observation for the Grid2Op simulation"""
    global env, obs
    if env is None:
        logging.info(msg="Loading Grid Environment from Grid2op...")
        env = setup_env()
        obs = env.reset()
        logging.info(msg="Model has been loaded successfully...")
    return env, obs

def setup_env():
    """ Creates the environment for the Grid2Op simulation"""
    environment = grid2op.make("l2rpn_case14_sandbox",
                                backend=LightSimBackend())
    return environment