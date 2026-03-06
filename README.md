[English Version](#english-version) | [中文版](#中文版)

---

# English Version

# New English Learning App

A comprehensive, AI-powered English learning platform designed to help students efficiently build vocabulary, master grammar, and track their progress through intelligent question analysis and adaptive review.

## ✨ Features

- **Intelligent Question Bank**: Upload and manage English questions. Integrates with advanced OCR (Optical Character Recognition) like PaddleOCR to extract text directly from PDFs or images.
- **AI-Powered Analysis**: Uses large language models (LLMs) like DeepSeek, OpenAI, or Claude to parse English questions automatically, extract insights, and generate detailed explanations and intelligent tags.
- **Adaptive Practice System**: Provides multiple modes of practice (e.g., quizzes, recitation, dictation). Integrates a spaced repetition algorithm (SM-2 principles) to schedule reviews right when you need them.
- **Error Analysis Reports**: Tracks mistakes over time and can generate AI-based personalized reports highlighting your weak points and offering specific improvement strategies.
- **Role-Based Workflows**: Separate experiences for `admin` (question curation, system configuration, member management) and `student` (practice, revision, personal analysis).

---

## 🚀 Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

- Node.js `18.x` or higher
- A Supabase account and project
- Optional: Python environment if using local PaddleOCR deployment

### 1. Clone the repository

```bash
git clone https://github.com/your-username/english-learning-app.git
cd english-learning-app
```

### 2. Install dependencies

```bash
npm install
# or
yarn install
# or
pnpm install
```

### 3. Supabase Database Configuration

This project relies on Supabase for Auth (PostgreSQL database + Row Level Security) and Storage. 

1. Create a new project on [Supabase](https://supabase.com).
2. Go to the **SQL Editor** in your Supabase dashboard.
3. Open the `init_database_all_in_one.sql` file included in the root of this repository.
4. Copy the entire content of `init_database_all_in_one.sql` and paste it into the Supabase SQL Editor.
5. Click **Run** to execute the script.
   *This script does everything in one step: creates `profiles`, `system_settings`, `questions`, `quiz_results`, sets up Row Level Security (RLS) policies, and creates necessary Auth triggers for new signups.*
6. (Optional) For Storage, create a bucket named `source_materials` in your Supabase Storage dashboard and ensure it's set to public (or define specific RLS rules if necessary).

### 4. Environment Variables

Create a `.env.local` file in the root directory based on `.env.local.example`.

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# AI / API Configuration (Optional, can also be configured in the unified Admin Settings Panel)
AI_API_KEY=your-api-key
OCR_API_KEY=your-ocr-api-key
```

### 5. Start the Development Server

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
The first registered user is created as a `student` by default. You can change their role to `admin` directly inside the Supabase `profiles` table to access Admin features.

## 🛠 Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router)
- **Database & Auth**: [Supabase](https://supabase.com/)
- **UI Library**: [Tailwind CSS](https://tailwindcss.com/) & [shadcn/ui](https://ui.shadcn.com/)
- **AI Integrations**: DeepSeek / OpenAI / Anthropic integration
- **Deploying**: Ready for [Vercel](https://vercel.com/)


---

<br/><br/>

# 中文版

# New English Learning App （英语学习应用）

一个全面、由 AI 驱动的英语学习平台，旨在帮助学生高效地建立词汇量、掌握语法，并通过智能题目分析和自适应复习系统跟踪学习进度。

## ✨ 核心功能

- **智能题库**：上传及管理英语题目。集成了高级的 OCR（光学字符识别）引擎（如 PaddleOCR），可直接从 PDF 或图片中提取文本和题目内容。
- **AI 智能解析**：使用大语言模型（LLMs，如 DeepSeek、OpenAI 或 Claude）自动解析英语题目，提取知识点，并生成详细的解析说明以及智能分类标签。
- **自适应练习系统**：提供多种练习模式（如测验、背诵、听写）。结合了间隔重复算法（基于 SM-2 原理），在学生刚好遗忘时精准安排复习。
- **错题分析报告**：记录使用者的历史错题，并可通过 AI 生成个性化分析报告，指出薄弱环节并提供针对性的提升策略。
- **基于角色的工作流**：为 `管理员 (admin)`（题目审核收录、系统配置、成员管理） 和 `学生 (student)`（个人练习、错题复习、个人学情分析） 提供独立的操作体验体系。

---

## 🚀 快速开始

通过以下步骤获取项目将其在您的本地环境运行用于开发和测试目的。

### 环境要求

- Node.js `18.x` 或更高版本
- 一个 Supabase 账户和项目
- （可选）如需本地部署 PaddleOCR 则需要 Python 环境

### 1. 克隆代码库

```bash
git clone https://github.com/your-username/english-learning-app.git
cd english-learning-app
```

### 2. 安装依赖

```bash
npm install
# 或者
yarn install
# 或者
pnpm install
```

### 3. Supabase 数据库配置

本项目依赖于 Supabase 提供的账号认证 Auth（PostgreSQL 数据库 + RLS 行级权限安全）与 Storage 存储服务。

1. 在 [Supabase](https://supabase.com) 上创建一个新项目。
2. 前往 Supabase 仪表盘中的 **SQL Editor（SQL 编辑器）**。
3. 打开本地项目根目录中包含的 `init_database_all_in_one.sql` 文件。
4. 复制 `init_database_all_in_one.sql` 的全部内容并粘贴至 Supabase SQL Editor。
5. 点击 **Run（运行）** 以执行脚本。
   *该脚本将一站式完成所有配置：创建 `profiles`, `system_settings`, `questions`, `quiz_results` 等所有核心表，同时自动设置相关的 RLS 行级安全策略，并自动穿插新用户注册时需要的触发器 (Triggers)。*
6. （可选）对于 Storage 文件存储，请在您的 Supabase Storage 仪表盘上创建一个名为 `source_materials` 的存储桶（bucket），并确保将其设为公开 public（或根据需要自定义 RLS 的安全策略）。

### 4. 环境变量

根据 `.env.local.example` 在根目录中创建一个 `.env.local` 环境变量文件。

```env
# Supabase 配置
NEXT_PUBLIC_SUPABASE_URL=你的-supabase-url地址
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的-supabase-anon-key

# AI / 服务 API 配置（可选，上述设置也可以部署后统一在前端的“管理员设置”面板中热更新）
AI_API_KEY=你的-ai-api-key
OCR_API_KEY=你的-ocr-api-key
```

### 5. 启动开发服务器

```bash
npm run dev
# 或者
yarn dev
# 或者
pnpm dev
```

在您的浏览器中打开 [http://localhost:3000](http://localhost:3000) 即可查看最终结果。
注意：默认首个注册的用户为 `student（学生）` 角色。您可以直接去 Supabase 的 `profiles` 数据库表中将其改为 `admin（管理员）` 从而访问相关的管理员特性。

## 🛠 技术栈

- **前端框架**: [Next.js](https://nextjs.org/) (App Router 模式)
- **数据库与身份认证**: [Supabase](https://supabase.com/)
- **UI 组件库**: [Tailwind CSS](https://tailwindcss.com/) 配合 [shadcn/ui](https://ui.shadcn.com/)
- **人工智能集成**: DeepSeek / OpenAI / Anthropic 接口支持
- **线上部署**: 为无缝部署到 [Vercel](https://vercel.com/) 做好了准备
