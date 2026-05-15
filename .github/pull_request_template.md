## Summary

- 

## Checks

- [ ] `docker compose config --quiet`
- [ ] Backend syntax check or targeted backend verification
- [ ] `npm audit --omit=dev` for affected packages
- [ ] `npm run build` in `frontend` when frontend code changes

## Security Notes

- [ ] This change does not expand the claimed end-to-end encryption boundary.
- [ ] Any new secrets or credentials are documented in `.env.example`, not committed with real values.
