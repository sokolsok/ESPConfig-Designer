# Known Issues

This document records user-visible limitations that are accepted for a release
but are not considered resolved. Release notes should link to the applicable
entries instead of describing an affected build as having no known issues.

## Windows Desktop 1.4.0

### A second launch may not restore a minimized window

**Status:** Accepted non-blocking release issue

When ESPConfig Designer is already running with its main window minimized,
launching the application again may not reliably restore or focus that window.
The existing window can be restored manually from the Windows taskbar.

The release exception applies only to window activation. Release validation
must still prove that:

- the original application process remains running;
- the second process exits successfully;
- no second backend or loopback listener is created;
- the workspace and application-data safety checks pass;
- normal launch, close, restart, and uninstall behavior remains valid.

The clean-machine report must identify this check as an accepted warning. It
must not report an unconditional `20/20 PASS` when automatic restore or focus
was not observed.

This issue is planned for a later Windows Desktop maintenance release. It does
not waive failures involving duplicate backends, process ownership, data
integrity, installation, startup, shutdown, or cleanup.
