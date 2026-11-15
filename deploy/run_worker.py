"""Start local lifecycle/payment jobs with the same private settings as the API."""
from deploy.inspect_database import load_environment

if __name__ == '__main__':
    load_environment()
    from backend.community_worker import main
    main()
