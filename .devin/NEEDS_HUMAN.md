# Needs Human — action inbox for the owner

Format: `- <date> | <blocked> | needs: <action> | ref:`

- 2026-10-25 | social-daily GH workflow can't publish (0 posts → red run by design) | needs: add repo secrets `BUFFER_ACCESS_TOKEN` + `BUFFER_ORG_ID` to github.com/Settle-In-Peace/Settle → Settings → Secrets → Actions (values are in `tools/social/.env` on the ops box / in this repo's local checkout — org `6ad50d34b15361b8758c2877`); optional `BUFFER_CHANNEL_IDS` (blank = all connected channels) | ref: .github/workflows/social-daily.yml, tools/social/env.example
- 2026-10-25 | Buffer org has zero connected channels — even with secrets, Buffer posts to nothing | needs: publish.buffer.com → Settings → Channels → Connect channel → X (30s); FB/IG/LinkedIn optional | ref: AGENT_STATE.md "Blocked on user" (social posting never run)
- 2026-10-25 | Optional direct-platform posting (bypass Buffer, free) | needs: any of `BLUESKY_HANDLE`/`BLUESKY_APP_PASSWORD`, `MASTODON_*`, `FB_PAGE_*`, `LINKEDIN_*`, `REDDIT_*`, `X_*`, `TUMBLR_*`, `NEXTDOOR_*` as repo secrets — each set enables that platform, unset ones skip cleanly | ref: tools/social/env.example
