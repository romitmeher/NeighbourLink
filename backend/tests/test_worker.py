from contextlib import contextmanager
from backend import community_worker as worker


def test_worker_runs_expiry_and_gateway_reconciliation(monkeypatch):
    calls=[]
    @contextmanager
    def transaction():
        calls.append('begin')
        yield 'connection'
        calls.append('commit')
    monkeypatch.setattr(worker.engine,'begin',transaction)
    monkeypatch.setattr(worker,'run_jobs',lambda conn:calls.append('expiry'))
    monkeypatch.setattr(worker,'process_refunds',lambda:calls.append('reconcile'))
    monkeypatch.setattr('sys.argv',['worker','--once'])
    worker.main()
    assert calls==['begin','expiry','commit','reconcile']
