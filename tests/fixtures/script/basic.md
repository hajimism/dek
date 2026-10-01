---
# yaml-language-server: $schema=../../.dek/schema.json
title: HTML スライドツールを作った話
event: Tokyo Frontend Meetup #42
date: 2026-04-18
duration: 20m
---

## intro

こんにちは。今日は、スライドツールを自分で作った話をします。

> 自己紹介は短く。時計を見ない。

## 発表の前日に何をしていますか {#problem}

みなさん、発表の前日に何をしていますか。

聴衆が「自分ごと」だと思うまで喋る。3 つ目が本命。

## architecture

さて、ここが今日いちばん覚えて帰ってほしいところです。
左が入力、右が出力。

### script.md が親 {#script-parent}

まず script.md がいて、

### スライドがぶら下がる {#slides-hang}

その下にスライドがぶら下がっている。逆ではありません。

### 逆だと喋れない {#inverted}

この向きが逆だと、資料が立派になるほど喋れなくなります。
