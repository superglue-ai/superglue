#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PLATFORMS="linux/amd64,linux/arm64"
COMMIT_SHA=$(git rev-parse HEAD)
SHORT_SHA=$(git rev-parse --short HEAD)

echo -e "${GREEN}=== Superglue Multi-Architecture Docker Build ===${NC}"
echo "Commit: $SHORT_SHA"
echo "Platforms: $PLATFORMS"
echo ""

# Check if logged in to Docker Hub
if ! docker info | grep -q "Username"; then
    echo -e "${YELLOW}Not logged in to Docker Hub. Running 'docker login'...${NC}"
    docker login
fi

# Setup buildx builder
echo -e "${GREEN}Setting up Docker buildx builder...${NC}"
docker buildx create --name superglue-builder --use --bootstrap 2>/dev/null || docker buildx use superglue-builder

# Function to build and push image
build_and_push() {
    local dockerfile=$1
    local image_name=$2
    local description=$3

    echo ""
    echo -e "${GREEN}=== Building $description ===${NC}"
    echo "Image: $image_name"
    echo "Dockerfile: $dockerfile"
    echo ""

    docker buildx build \
        --platform $PLATFORMS \
        --file $dockerfile \
        --tag $image_name:latest \
        --tag $image_name:$SHORT_SHA \
        --push \
        --progress=plain \
        .

    echo -e "${GREEN}✓ Successfully built and pushed $image_name${NC}"
}

# Ask which images to build
echo "Which images would you like to build?"
echo "1) Full image (web + server)"
echo "2) Server only"
echo "3) Web only"
echo "4) All images"
read -p "Enter choice (1-4): " choice

case $choice in
    1)
        build_and_push "docker/Dockerfile" "superglueai/superglue" "Full Image (Web + Server)"
        ;;
    2)
        build_and_push "docker/Dockerfile.server" "superglueai/superglue-server-only" "Server Only"
        ;;
    3)
        build_and_push "docker/Dockerfile.web" "superglueai/superglue-web-only" "Web Only"
        ;;
    4)
        build_and_push "docker/Dockerfile" "superglueai/superglue" "Full Image (Web + Server)"
        build_and_push "docker/Dockerfile.server" "superglueai/superglue-server-only" "Server Only"
        build_and_push "docker/Dockerfile.web" "superglueai/superglue-web-only" "Web Only"
        ;;
    *)
        echo -e "${RED}Invalid choice. Exiting.${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}=== Build Complete ===${NC}"
echo "Published images:"
case $choice in
    1)
        echo "  - superglueai/superglue:latest"
        echo "  - superglueai/superglue:$SHORT_SHA"
        ;;
    2)
        echo "  - superglueai/superglue-server-only:latest"
        echo "  - superglueai/superglue-server-only:$SHORT_SHA"
        ;;
    3)
        echo "  - superglueai/superglue-web-only:latest"
        echo "  - superglueai/superglue-web-only:$SHORT_SHA"
        ;;
    4)
        echo "  - superglueai/superglue:latest"
        echo "  - superglueai/superglue:$SHORT_SHA"
        echo "  - superglueai/superglue-server-only:latest"
        echo "  - superglueai/superglue-server-only:$SHORT_SHA"
        echo "  - superglueai/superglue-web-only:latest"
        echo "  - superglueai/superglue-web-only:$SHORT_SHA"
        ;;
esac
echo ""
echo "Platforms: linux/amd64, linux/arm64"
