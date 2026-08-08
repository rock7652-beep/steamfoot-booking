# Customer placeholder-name audit status

The historical Production audit for `Customer.name = '顧客'` is **not yet executed against Production**.

Reason: the currently connected database tooling does not expose the SteamFoot Production database, so producing counts without the real Production target would be unsafe and misleading.

The audit must remain SELECT-only and aggregate-first when a verified Production connection is available.
