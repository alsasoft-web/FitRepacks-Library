# Contributing to FitRepacks Library

Thank you for your interest in contributing to FitRepacks Library. Whether reporting a bug, proposing an improvement, or submitting code changes, your help is appreciated.

## Code of Conduct

All contributors and maintainers are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md). Please keep interactions constructive and respectful.

## How to Contribute

### Reporting Bugs

Before creating a new bug report, search existing issues to see if the problem has already been reported.

When opening an issue, include:
- A concise summary of the issue.
- Clear step-by-step instructions to reproduce the problem.
- Your operating system version, Node.js version, and app version.
- Relevant log output or error messages from the terminal or browser console.

### Proposing Enhancements

Feature requests and design suggestions are welcomed. When suggesting a feature:
- Describe the problem your feature solves or the workflow it improves.
- Explain how you envision the feature working.
- Keep the scope practical and aligned with the project goals.

### Pull Request Process

1. Fork the repository and create a branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Make your changes and test them locally using `npm run tauri:dev` or `npm run dev`.
4. Run the linter to verify code cleanliness:
   ```bash
   npm run lint
   ```
5. Commit your changes with clear, descriptive commit messages.
6. Push to your fork and submit a Pull Request to the `main` branch.

## Development Guidelines

- TypeScript: Maintain strict typing where possible and avoid using `any`.
- Mantine UI: Follow established Mantine component conventions and styling patterns used across the app.
- Performance: Keep bundle sizes in mind and avoid unnecessary re-renders in component state.
- Security: Never commit API credentials or sensitive tokens in example files or source code.
