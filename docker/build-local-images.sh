#!/bin/bash
set -e

# Default to using local base image
USE_ONLINE_BASE=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --use-online-base)
      USE_ONLINE_BASE=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--use-online-base]"
      exit 1
      ;;
  esac
done

# Determine the current architecture
ARCH=$(uname -m | grep -q "x86_64" && echo "amd64" || echo "arm64")
echo "Building Docker images for architecture: $ARCH"

# Set image names and tags
BASE_IMAGE_NAME="superglue-base"
APP_IMAGE_NAME="superglue"
ONLINE_BASE_IMAGE="superglueai/superglue-base"
BASE_IMAGE_TAG="latest"
APP_IMAGE_TAG="latest"

echo "=== Step 1: Building base image ==="
docker build \
  -f docker/Dockerfile.base \
  -t $BASE_IMAGE_NAME:$BASE_IMAGE_TAG \
  -t $BASE_IMAGE_NAME:$BASE_IMAGE_TAG-$ARCH \
  .

# Create temporary Dockerfile based on whether to use online or local base image
if [ "$USE_ONLINE_BASE" = true ]; then
  echo "=== Step 2: Building application image using online base image ==="
  BASE_IMAGE_REF="$ONLINE_BASE_IMAGE:$BASE_IMAGE_TAG"
else
  echo "=== Step 2: Building application image using local base image ==="
  BASE_IMAGE_REF="$BASE_IMAGE_NAME:$BASE_IMAGE_TAG"
  
  # Create a temporary Dockerfile that uses the local base image
  TMP_DOCKERFILE=$(mktemp)
  sed "s|FROM superglueai/superglue-base:latest|FROM $BASE_IMAGE_REF|g" docker/Dockerfile > $TMP_DOCKERFILE
  
  # Build the application image using the temporary Dockerfile
  docker build \
    -f $TMP_DOCKERFILE \
    -t $APP_IMAGE_NAME:$APP_IMAGE_TAG \
    -t $APP_IMAGE_NAME:$APP_IMAGE_TAG-$ARCH \
    .
  
  # Remove the temporary Dockerfile
  rm $TMP_DOCKERFILE
  
  echo -e "\n=== Build Complete ==="
  echo "Images built:"
  echo "- $BASE_IMAGE_NAME:$BASE_IMAGE_TAG"
  echo "- $BASE_IMAGE_NAME:$BASE_IMAGE_TAG-$ARCH"
  echo "- $APP_IMAGE_NAME:$APP_IMAGE_TAG"
  echo "- $APP_IMAGE_NAME:$APP_IMAGE_TAG-$ARCH"
  echo -e "\nTo run the application:"
  echo "docker run -p 3000:3000 -p 3001:3001 $APP_IMAGE_NAME:$APP_IMAGE_TAG-$ARCH"
  exit 0
fi

# If using online base image, use the original Dockerfile
docker build \
  -f docker/Dockerfile \
  -t $APP_IMAGE_NAME:$APP_IMAGE_TAG \
  -t $APP_IMAGE_NAME:$APP_IMAGE_TAG-$ARCH \
  .

echo -e "\n=== Build Complete ==="
echo "Images built:"
echo "- $BASE_IMAGE_NAME:$BASE_IMAGE_TAG"
echo "- $BASE_IMAGE_NAME:$BASE_IMAGE_TAG-$ARCH"
echo "- $APP_IMAGE_NAME:$APP_IMAGE_TAG"
echo "- $APP_IMAGE_NAME:$APP_IMAGE_TAG-$ARCH"
echo -e "\nTo run the application:"
echo "docker run -p 3000:3000 -p 3001:3001 $APP_IMAGE_NAME:$APP_IMAGE_TAG-$ARCH" 
