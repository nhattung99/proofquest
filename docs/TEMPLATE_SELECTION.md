# Confirmed first quest

The owner selected **Account Ownership (X)** from Developer Hub Templates Market. ProofQuest calls this quest **Verify Your X Account**.

Template ID: `2e3160ae-8b1e-45e3-8c59-426366278b9d`. Source: `https://x.com/home`. Request: `https://api.x.com/1.1/account/settings.json.*`. Field: `screen_name`. JSONPath: `$.screen_name`.

No further template creation/editing or manual parseType configuration is required by the inspected official SDK/demo flow. The existing Marketplace ID is passed directly to generateRequestParams. Expected parseType remains unpinned because the Marketplace does not expose it. See [integration and browser-test guide](PRIMUS_INTEGRATION.md) for the supported checks, limits and manual appSecret/extension setup.

This template does not establish following, posting, liking or reposting on X. Claims remain disabled.
