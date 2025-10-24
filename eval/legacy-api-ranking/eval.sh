pm2 stop generate-ranking
pm2 start npm --name "generate-ranking" --no-autorestart -- run generate-ranking -d