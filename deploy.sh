#!/bin/bash

# 全社員分析ダッシュボード - デプロイスクリプト

SOURCE_DIR="/Users/ebineryota/code/all_staff_analysis"
DEST_DIR="/Users/ebineryota"

# メインダッシュボード
cp "$SOURCE_DIR/index.html" "$DEST_DIR/all_staff_analysis.html"

# 過去比較表
cp "$SOURCE_DIR/comparison.html" "$DEST_DIR/all_staff_comparison.html"

# プレゼンモード
cp "$SOURCE_DIR/presentation.html" "$DEST_DIR/all_staff_presentation.html"

if [ $? -eq 0 ]; then
    echo "デプロイ完了:"
    echo "  - $DEST_DIR/all_staff_analysis.html"
    echo "  - $DEST_DIR/all_staff_comparison.html"
    echo "  - $DEST_DIR/all_staff_presentation.html"
    echo ""
    echo "ブラウザで確認:"
    echo "  file://$DEST_DIR/all_staff_analysis.html"
    echo "  file://$DEST_DIR/all_staff_comparison.html"
    echo "  file://$DEST_DIR/all_staff_presentation.html"
else
    echo "デプロイ失敗"
    exit 1
fi
