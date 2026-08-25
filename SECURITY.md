# Reporting Security Issues

If you believe you have found a security vulnerability in NEXUS, please report
it privately rather than through a public GitHub issue.

Use GitHub's private vulnerability reporting on the repository:
<https://github.com/Victor00128/nexus-cli/security/advisories/new>

Please include what you did, what you expected, and what happened instead. A
minimal reproduction helps a lot.

NEXUS is maintained by one person in their spare time, so please allow some time
for a reply. Legitimate reports will be investigated and fixed as quickly as is
practical.

## Scope notes

NEXUS runs shell commands and edits files on your machine on the model's
instruction. That is the product working as intended, not a vulnerability. What
*is* in scope: escaping the permission and sandbox checks that are supposed to
gate those actions, path traversal outside the project root, and anything that
leaks your OpenRouter API key off the machine.
