import pytest

from app import config, store
from app.services import azure


class RealAzureCalled(BaseException):
    """서비스 코드의 `except Exception`에 잡히지 않도록 BaseException을 쓴다."""


@pytest.fixture(autouse=True)
def no_real_azure(monkeypatch):
    """모든 테스트는 키 없는 설정·메모리 저장소로 시작하고, 실제 외부 호출을 하지 않는다."""
    monkeypatch.setattr(config, "settings", config.Settings())
    monkeypatch.setattr(store, "_store", None)  # 테스트마다 새 메모리 저장소

    def blocked(*args, **kwargs):
        raise RealAzureCalled("테스트에서 실제 Azure 호출이 일어났어요.")

    monkeypatch.setattr(azure, "post_json", blocked)
    monkeypatch.setattr(azure._client, "post", blocked)
