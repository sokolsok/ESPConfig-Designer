# Code signing policy

ESPConfig Designer is applying to use the following service:

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).

The currently published Windows 1.4.0 release is unsigned. This policy applies
to Windows Desktop artifacts submitted for code signing.

## Team roles

- Authors and committers: [Sebastian Sokołowski (@sokolsok)](https://github.com/sokolsok)
- Reviewers: [Sebastian Sokołowski (@sokolsok)](https://github.com/sokolsok)
- Approvers: [Sebastian Sokołowski (@sokolsok)](https://github.com/sokolsok)

Changes submitted by contributors who do not have direct commit access must be
reviewed before merging. Every production signing request requires manual
approval by an Approver.

## Signing process

Only release artifacts produced from the project's maintained source code and
controlled build workflow may be submitted for signing. Signing credentials are
not stored in the repository or distributed with the application. Upstream
third-party binaries may be included in a release package but are not signed as
project-owned binaries.

## Privacy

ESPConfig Designer does not collect or transmit telemetry, analytics, usage statistics, crash reports, or advertising identifiers.

The project does not operate a service that receives users' projects,
configurations, credentials, device information, firmware, or application usage
data. Application data is stored in locations controlled by the user, except
when a selected operation requires communication with a device or external
service.

The Windows Desktop application automatically downloads static user-interface
resources from the following services:

- Space Grotesk stylesheet and font files from `fonts.googleapis.com` and
  `fonts.gstatic.com`;
- Material Design Icons metadata and image files from `cdn.jsdelivr.net`.

These providers may receive the user's IP address, request time, user agent, and
other standard HTTP request metadata. The requests identify the required font
or icon resource. ESPConfig Designer does not include project files, YAML,
credentials, device addresses, firmware, telemetry, or analytics data in these
requests. The requests are subject to the providers' respective privacy
policies: the [Google Privacy Policy](https://policies.google.com/privacy) and
the [jsDelivr privacy policy](https://www.jsdelivr.com/terms/privacy-policy-jsdelivr-net).

Other network operations occur when required by installation or by a feature
selected by the user or operator. These operations may include:

- downloading Microsoft Edge WebView2 when it is not already installed;
- downloading dependencies required for firmware compilation;
- downloading a font used by a display project;
- connecting to devices configured by the user;
- validating, compiling, uploading, or installing firmware;
- OTA operations and device logs;
- opening an external link selected by the user.

Those operations communicate only with the prerequisite provider, dependency
source, service, link, or device involved in the selected operation. ESPConfig
Designer does not sell user information and does not use advertising or
behavioral tracking services.
