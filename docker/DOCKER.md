# Docker Build Process

We use a two stage build process to increase deploy speed.

1. A base image containing all dependencies is built nightly
2. The application image is built on top of that image

## Base Image

The base image contains:
- Node.js and npm
- All project dependencies
- Build tools (TypeScript, Next.js, Turbo)
- Playwright with browser dependencies

This image is automatically built every night via GitHub Actions and pushed to DockerHub as a multi-architecture image at `superglueai/superglue-base:latest`.

## Application Image

The application image contains:
- The base image
- The application source code
- Updated dependencies

## Building Locally

Because the application image now depends on the base image, we made a script
which ensures that we can still build all images locally.

```bash
./docker/build-local-images.sh
# OR, using the online base image
./docker/build-local-images.sh --use-online-base
```

### Running the Application

```bash
docker run -p 3000:3000 -p 3001:3001 superglue:latest
```

## CI/CD Integration
1. **Nightly Base Image Workflow** (`.github/workflows/nightly-base-image.yml`):
   - Builds a multi-architecture base image daily (2am UTC)
   - Pushes to DockerHub as `superglueai/superglue-base:latest`

2. **Application Image Workflow** (`.github/workflows/docker-publish.yml`):
   - Triggered on pushes to main, updates dependencies from base image
   - Pushes to DockerHub as `superglueai/superglue:latest`

