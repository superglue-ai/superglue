#!/bin/bash

# Configuration
TEST_DIR="../.superglue"
LOGS_FILE="$TEST_DIR/superglue_logs.jsonl"
TARGET_SIZE_MB=1024
BATCH_SIZE=1000

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Generating 1GB test log file for FileStore performance testing${NC}"

# Create test directory
mkdir -p "$TEST_DIR"

# Remove existing file
if [ -f "$LOGS_FILE" ]; then
    rm "$LOGS_FILE"
    echo -e "${YELLOW}🗑️  Removed existing test file${NC}"
fi

# Calculate target size in bytes
TARGET_SIZE_BYTES=$((TARGET_SIZE_MB * 1024 * 1024))
CURRENT_SIZE=0
RECORD_COUNT=0

echo -e "${BLUE}📝 Starting generation...${NC}"
START_TIME=$(date +%s)

# Pre-generate some UUIDs and timestamps
BASE_TIMESTAMP=$(date +%s)
TIMESTAMPS=()
UUIDS=()
for ((t=0; t<1000; t++)); do
    TS=$((BASE_TIMESTAMP - RANDOM % 86400))
    if [[ "$OSTYPE" == "darwin"* ]]; then
        START_ISO=$(date -u -r $TS +"%Y-%m-%dT%H:%M:%S.%3")
        END_ISO=$(date -u -r $((TS + 60 + RANDOM % 300)) +"%Y-%m-%dT%H:%M:%S.%3")
    else
        START_ISO=$(date -u -d "@$TS" +"%Y-%m-%dT%H:%M:%S.%3")
        END_ISO=$(date -u -d "@$((TS + 60 + RANDOM % 300))" +"%Y-%m-%dT%H:%M:%S.%3")
    fi
    TIMESTAMPS[$t]="$START_ISO|$END_ISO"
    # Generate UUID-like strings
    UUIDS[$t]=$(printf "%08x-%04x-%04x-%04x-%012x" $RANDOM $RANDOM $RANDOM $RANDOM $RANDOM$RANDOM)
done

# Generate records in batches
while [ $CURRENT_SIZE -lt $TARGET_SIZE_BYTES ]; do
    BATCH_FILE=$(mktemp)
    
    for ((i=1; i<=BATCH_SIZE; i++)); do
        UUID_INDEX=$((RANDOM % 1000))
        TS_INDEX=$((RANDOM % 1000))
        IFS='|' read -r START_TIME_ISO END_TIME_ISO <<< "${TIMESTAMPS[$TS_INDEX]}"
        
        RUN_ID="${UUIDS[$UUID_INDEX]}"
        ORG_ID="org-$((RANDOM % 10))"
        CONFIG_ID="config-$((RANDOM % 5))"
        SUCCESS=$([[ $((RANDOM % 10)) -lt 9 ]] && echo "true" || echo "false")
        
        # Generate the JSON structure matching the real schema
        printf '{"id":"%s","success":%s,"config":{"id":"%s","steps":[{"id":"getAllBreeds","apiConfig":{"id":"getAllBreeds","urlHost":"https://dog.ceo/api","urlPath":"/breeds/list/all","instruction":"Get all dog breeds","method":"GET"},"executionMode":"DIRECT","inputMapping":"$","responseMapping":"$keys($.message)"},{"id":"getBreedImage","apiConfig":{"id":"getBreedImage","urlHost":"https://dog.ceo/api","urlPath":"/breed/{currentItem}/images/random","instruction":"Get a random image for a specific dog breed","method":"GET"},"executionMode":"LOOP","loopSelector":"getAllBreeds","loopMaxIters":5,"inputMapping":"$","responseMapping":"$"}],"finalTransform":"(sourceData) => {\\n  return {\\n    result: Array.isArray(sourceData.getBreedImage)\\n      ? sourceData.getBreedImage\\n          .filter((item) => typeof item === \\\"object\\\" && item !== null)\\n          .map((item) => ({\\n            breed: item.currentItem ?? null,\\n            image: item.message ?? null,\\n          }))\\n      : [],\\n  };\\n};\\n","responseSchema":{"type":"object","properties":{"result":{"type":"array","items":{"type":"object","properties":{"breed":{"type":"string"},"image":{"type":"string"}}}}}}},"stepResults":[{"stepId":"getAllBreeds","success":true,"config":{"id":"getAllBreeds","urlHost":"https://dog.ceo/api","urlPath":"/breeds/list/all","instruction":"Get all dog breeds","method":"GET"},"data":["affenpinscher","african","airedale","akita","appenzeller"]},{"stepId":"getBreedImage","success":true,"config":{"id":"getBreedImage","urlHost":"https://dog.ceo/api","urlPath":"/breed/{currentItem}/images/random","instruction":"Get a random image for a specific dog breed","method":"GET"},"data":[{"currentItem":"affenpinscher","message":"https://images.dog.ceo/breeds/affenpinscher/n02110627_%d.jpg","status":"success"}],"error":""}],"startedAt":"%s","completedAt":"%s","orgId":"%s"}\n' \
            "$RUN_ID" "$SUCCESS" "$CONFIG_ID" $((RANDOM % 99999)) $((RANDOM % 99999)) "$START_TIME_ISO" "$END_TIME_ISO" "$ORG_ID" >> "$BATCH_FILE"
        
        RECORD_COUNT=$((RECORD_COUNT + 1))
        
        if [ $((RECORD_COUNT % BATCH_SIZE)) -eq 0 ]; then
            CURRENT_SIZE=$(wc -c < "$LOGS_FILE" 2>/dev/null || echo 0)
            CURRENT_SIZE=$((CURRENT_SIZE + $(wc -c < "$BATCH_FILE")))
            if [ $CURRENT_SIZE -ge $TARGET_SIZE_BYTES ]; then
                break
            fi
        fi
    done
    
    # Append batch to main file
    cat "$BATCH_FILE" >> "$LOGS_FILE"
    rm "$BATCH_FILE"
    
    # Progress update every 50k records (less frequent)
    if [ $((RECORD_COUNT % 50000)) -eq 0 ]; then
        CURRENT_SIZE_MB=$((CURRENT_SIZE / 1024 / 1024))
        echo -e "${YELLOW}  Generated $RECORD_COUNT records, ${CURRENT_SIZE_MB}MB...${NC}"
    fi
done

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Get actual file size (cross-platform)
if [[ "$OSTYPE" == "darwin"* ]]; then
    ACTUAL_SIZE=$(stat -f%z "$LOGS_FILE")
else
    ACTUAL_SIZE=$(stat -c%s "$LOGS_FILE")
fi
ACTUAL_SIZE_MB=$((ACTUAL_SIZE / 1024 / 1024))

echo -e "${GREEN}✅ Generation complete!${NC}"
echo -e "${GREEN}   Records: $RECORD_COUNT${NC}"
echo -e "${GREEN}   File size: ${ACTUAL_SIZE_MB}MB${NC}"
echo -e "${GREEN}   Duration: ${DURATION}s${NC}"
echo -e "${GREEN}   File location: $LOGS_FILE${NC}"

echo -e "\n${BLUE}📊 Quick file stats:${NC}"
echo -e "   Lines: $(wc -l < "$LOGS_FILE")"
echo -e "   Size: $(ls -lh "$LOGS_FILE" | awk '{print $5}')"

echo -e "\n${BLUE}🔍 Sample of generated data:${NC}"
head -n 1 "$LOGS_FILE" | python3 -m json.tool 2>/dev/null || head -n 1 "$LOGS_FILE"

echo -e "\n${YELLOW}💡 To test performance, run your FileStore tests with TEST_DIR='$TEST_DIR'${NC}"
echo -e "${YELLOW}💡 To cleanup: rm -rf $TEST_DIR${NC}" 