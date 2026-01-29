import pytest

from app.utils.validators import is_valid_pr_url, sanitize_path


@pytest.mark.parametrize(
    "url,expected",
    [
        ("https://github.com/org/repo/pull/123", True),
        ("https://github.com/org/repo/issues/1", False),
        ("http://github.com/org/repo/pull/1", False),
    ],
)
def test_is_valid_pr_url(url: str, expected: bool):
    assert is_valid_pr_url(url) is expected


def test_sanitize_path_rejects_traversal():
    with pytest.raises(ValueError):
        sanitize_path("../secret.txt")


def test_sanitize_path_allows_relative():
    assert sanitize_path("src/main.py") == "src/main.py"
