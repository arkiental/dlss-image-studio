# Security

Security fixes target the current release and `main`; older previews may not receive
backports. This project has no guaranteed response-time or support SLA.

Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/arkiental/dlss-image-studio/security/advisories/new).
Do not put exploits, credentials or private images in public issues. If that form is
unavailable, open a public issue asking for a private reporting channel without
including sensitive details.

Include affected version, reproduction steps, impact and a minimal safe sample.
Neural runtime folders contain executable code: use the official distributor and
review its separate terms. Project/source files and custom LUTs should come from
trusted sources. Releases are currently unsigned; checksums detect corruption but
do not replace publisher identity verification.

Studio processes images locally. The neural provider is separate software with its
own behavior and terms. Studio does not bundle an automatic-update service.
