// INDRA authorization policy (Cedar). Evaluated by indra/policy/authz.py.
//
// Principals are Users ("Droplets"). role is one of: droplet | leader | admin.
// Default is deny: anything not permitted below is refused.

// A droplet reads and operates tanks they own.
permit (
  principal is User,
  action in [Action::"ReadTank", Action::"WriteTank"],
  resource is Tank
) when { resource.owner == principal };

// Anyone signed in may read a tank its owner has shared with the community.
permit (
  principal is User,
  action == Action::"ReadTank",
  resource is Tank
) when { resource.shared == true };

// A droplet manages only their own alert subscriptions.
permit (
  principal is User,
  action == Action::"ManageSubscription",
  resource is Subscription
) when { resource.owner == principal };

// Community leaders and admins may publish alerts to the community channel.
permit (
  principal is User,
  action == Action::"PublishAlert",
  resource is AlertChannel
) when { principal.role == "leader" || principal.role == "admin" };

// Retraining the community clustering model is admin-only.
permit (
  principal is User,
  action == Action::"TrainClusters",
  resource is System
) when { principal.role == "admin" };

// Admins can do everything else.
permit (
  principal is User,
  action,
  resource
) when { principal.role == "admin" };

// Suspended accounts are always refused, even admins.
forbid (
  principal is User,
  action,
  resource
) when { principal.suspended == true };
