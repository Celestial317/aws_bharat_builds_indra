"""Cedar policy tests: the policy file is the source of truth, so test it directly."""

import pytest

from indra.core.errors import AppError
from indra.core.security import Principal
from indra.policy.authz import authorize, is_allowed

ASHA = Principal("asha")
RAVI = Principal("ravi")
LEADER = Principal("lena", role="leader")
ADMIN = Principal("root", role="admin")
SUSPENDED_ADMIN = Principal("bad", role="admin", suspended=True)


def tank(owner, shared=False):
    return {"owner": owner, "shared": shared}


def test_owner_reads_and_writes_own_tank():
    assert is_allowed(ASHA, "ReadTank", "Tank", "t1", tank("asha"))
    assert is_allowed(ASHA, "WriteTank", "Tank", "t1", tank("asha"))


def test_stranger_cannot_touch_private_tank():
    assert not is_allowed(RAVI, "ReadTank", "Tank", "t1", tank("asha"))
    assert not is_allowed(RAVI, "WriteTank", "Tank", "t1", tank("asha"))


def test_shared_tank_is_read_only_for_others():
    assert is_allowed(RAVI, "ReadTank", "Tank", "t1", tank("asha", shared=True))
    assert not is_allowed(RAVI, "WriteTank", "Tank", "t1", tank("asha", shared=True))


def test_subscriptions_are_private():
    assert is_allowed(ASHA, "ManageSubscription", "Subscription", "s1", {"owner": "asha"})
    assert not is_allowed(RAVI, "ManageSubscription", "Subscription", "s1", {"owner": "asha"})


@pytest.mark.parametrize("who,expected", [(ASHA, False), (LEADER, True), (ADMIN, True)])
def test_publish_alert_roles(who, expected):
    assert is_allowed(who, "PublishAlert", "AlertChannel", "ch") is expected


@pytest.mark.parametrize("who,expected", [(ASHA, False), (LEADER, False), (ADMIN, True)])
def test_train_clusters_admin_only(who, expected):
    assert is_allowed(who, "TrainClusters", "System", "clustering") is expected


def test_admin_can_read_any_tank():
    assert is_allowed(ADMIN, "ReadTank", "Tank", "t1", tank("asha"))


def test_suspended_overrides_admin():
    assert not is_allowed(SUSPENDED_ADMIN, "ReadTank", "Tank", "t1", tank("bad"))


def test_unknown_action_is_denied_by_default():
    assert not is_allowed(ASHA, "LaunchRocket", "Tank", "t1", tank("asha"))


def test_authorize_raises_403():
    with pytest.raises(AppError) as exc:
        authorize(RAVI, "WriteTank", "Tank", "t1", tank("asha"))
    assert exc.value.status == 403
