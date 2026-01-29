## Description
<!-- Provide a brief description of the changes in this PR -->

## Related Issue
<!-- Link to the issue this PR addresses (e.g., Fixes #123) -->

Fixes #

## Type of Change
<!-- Mark the relevant option with an 'x' -->

- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ✨ New feature (non-breaking change which adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 📝 Documentation update
- [ ] 🎨 Code style update (formatting, renaming)
- [ ] ♻️ Code refactoring (no functional changes)
- [ ] 🔧 Build/configuration change
- [ ] ✅ Test update
- [ ] 🚀 Performance improvement

## Changes Made
<!-- List the key changes made in this PR -->

- 
- 
- 

## Testing
<!-- Describe the testing you have performed -->

### Backend Tests
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] All tests pass (`make backend-test`)

### Frontend Tests
- [ ] Unit tests added/updated
- [ ] Component tests added/updated
- [ ] All tests pass (`make frontend-test`)

### Manual Testing
<!-- Describe manual testing steps performed -->

- [ ] Tested locally in development environment
- [ ] Tested in Chrome extension (load unpacked)
- [ ] Tested edge cases and error handling

### Test Coverage
<!-- Report test coverage if applicable -->

- Backend coverage: ___%
- Frontend coverage: ___%

## Checklist
<!-- Mark completed items with an 'x' -->

### Code Quality
- [ ] Code follows the project's coding guidelines (see `CODING_GUIDELINES.md`)
- [ ] Self-review of code performed
- [ ] Code is well-commented, particularly in hard-to-understand areas
- [ ] Type hints (Python) / explicit types (TypeScript) added for new code
- [ ] No linting errors (`make lint`)
- [ ] Formatted with Black/isort (backend) or Prettier (frontend)

### Documentation
- [ ] README updated (if applicable)
- [ ] API documentation updated (if API changes made)
- [ ] Docstrings/JSDoc added for new functions/classes
- [ ] CHANGELOG.md updated with changes

### Security
- [ ] No hardcoded secrets or credentials
- [ ] No sensitive data logged (API keys, tokens, source code)
- [ ] Input validation added for user-provided data
- [ ] No use of `eval`, `new Function`, or `document.write` (frontend)
- [ ] No SQL injection or XSS vulnerabilities introduced

### Extension-Specific (if applicable)
- [ ] Manifest V3 compliance maintained
- [ ] CSP not weakened
- [ ] Permission justifications documented (if new permissions added)
- [ ] Extension ZIP size < 20MB (`make extension-size-check`)
- [ ] No remote code loading

### Database (if applicable)
- [ ] Migration scripts added (if schema changes)
- [ ] Indexes created for new queries
- [ ] TTL policies configured correctly

### Deployment (if applicable)
- [ ] Environment variables documented in `.env.example`
- [ ] Docker build successful (`make build`)
- [ ] Deployment instructions updated

### Dependencies
- [ ] No new dependencies added, OR new dependencies justified and approved
- [ ] Dependencies updated in `requirements.txt` (backend) or `package.json` (frontend)
- [ ] Security vulnerabilities checked (`safety check` for Python, `npm audit` for frontend)

## Screenshots / Recordings
<!-- If applicable, add screenshots or recordings to demonstrate the changes -->

## Breaking Changes
<!-- If this PR introduces breaking changes, describe them here and provide migration instructions -->

None

## Rollback Plan
<!-- Describe how to rollback this change if issues arise in production -->

## Additional Notes
<!-- Add any additional context or notes for reviewers -->

---

## Reviewer Checklist
<!-- For reviewers to complete -->

- [ ] Code reviewed and approved
- [ ] Tests reviewed and cover critical paths
- [ ] Documentation is clear and complete
- [ ] Security implications considered
- [ ] Performance implications considered (if applicable)
- [ ] Backward compatibility maintained (unless breaking change documented)

---

**By submitting this PR, I confirm that:**
- I have read and followed the [CODING_GUIDELINES.md](../CODING_GUIDELINES.md)
- I have tested my changes locally
- I have ensured no secrets or sensitive data are committed
- I have added tests for new functionality
- I have updated documentation as needed
