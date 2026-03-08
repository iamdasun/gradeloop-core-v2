#!/usr/bin/env python3
"""
GPU-Optimized Semantic Clone Detection - Complete Training & Evaluation Pipeline
================================================================================
Unified script for training, resuming, exporting, and evaluating semantic clone detection model.
Optimized for RTX PRO 6000 Blackwell Workstation (96GB VRAM)

Author: GradeLoop CIPAS Team
Date: March 8, 2026
"""

# ============================================================================
# 📦 IMPORTS (ALL IMPORTS FIRST)
# ============================================================================
import os
import sys
import json
import random
import logging
import argparse
import time
import warnings
import zipfile
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Tuple, Optional, Any
from collections import defaultdict
from itertools import combinations

warnings.filterwarnings('ignore')

# Google Drive download support
try:
    import gdown
    GDOWN_AVAILABLE = True
except ImportError:
    GDOWN_AVAILABLE = False
    gdown = None
    print("⚠️  WARNING: gdown not installed. Install with: pip install gdown")

# Scientific Computing
import numpy as np
import pandas as pd
from tqdm.auto import tqdm
import matplotlib.pyplot as plt
import seaborn as sns

# Machine Learning
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score, precision_recall_fscore_support, confusion_matrix,
    classification_report, roc_auc_score, roc_curve, precision_recall_curve,
    average_precision_score
)

# PyTorch
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
from torch.cuda.amp import autocast, GradScaler

# Transformers
from transformers import (
    AutoTokenizer, AutoModel,
    get_linear_schedule_with_warmup,
    logging as transformers_logging
)
transformers_logging.set_verbosity_error()

# ============================================================================
# ⚙️ CONFIGURATION VARIABLES (EDIT THESE)
# ============================================================================
MAX_SAMPLES = 200000              # Total dataset samples
NUM_EPOCHS = 20                   # Number of training epochs
BATCH_SIZE = 16                   # Training batch size (Safe default for large models)
EVAL_BATCH_SIZE = 32              # Evaluation batch size
LEARNING_RATE = 2e-5              # Learning rate
WEIGHT_DECAY = 0.01               # Weight decay for regularization
DROPOUT_RATE = 0.3                # Dropout rate
MAX_LENGTH = 512                  # Max token length
HIDDEN_SIZE = 768                 # Model hidden size
GRADIENT_ACCUMULATION_STEPS = 2   # Gradient accumulation (Effective batch = BATCH_SIZE * STEPS)
WARMUP_RATIO = 0.1                # Learning rate warmup ratio
LABEL_SMOOTHING = 0.1             # Label smoothing for overfitting prevention
EARLY_STOPPING_PATIENCE = 5       # Early stopping patience
RANDOM_SEED = 42                  # Random seed for reproducibility
DATA_AUGMENTATION = True          # Enable data augmentation
TRAIN_RATIO = 0.7                 # Training split ratio
VAL_RATIO = 0.15                  # Validation split ratio
TEST_RATIO = 0.15                 # Test split ratio
GPTCLONEBENCH_RATIO = 0.2         # GPTCloneBench portion of dataset
CLONE_RATIO = 0.5                 # Positive clone ratio in CodeNet

# Hardware Optimization
NUM_WORKERS = 4                   # DataLoader workers
USE_MIXED_PRECISION = True        # Enable AMP mixed precision
USE_TF32 = True                   # Enable TF32 for faster computation
PIN_MEMORY = True                 # Pin memory for faster GPU transfer

# Paths
MODEL_NAME = "microsoft/graphcodebert-base"
DATASETS_DIR = Path(__file__).parent.parent.parent.parent.parent / "datasets"
OUTPUT_DIR = Path(__file__).parent / "outputs"

# ============================================================================
# 🚀 HARDWARE OPTIMIZATION
# ============================================================================
def optimize_for_rtx6000(logger: logging.Logger):
    """Optimize PyTorch for RTX 6000 Blackwell"""
    if torch.cuda.is_available():
        torch.backends.cuda.matmul.allow_tf32 = USE_TF32
        torch.backends.cudnn.allow_tf32 = USE_TF32
        torch.backends.cudnn.benchmark = True
        torch.backends.cudnn.deterministic = False
        logger.info("✓ RTX 6000 Blackwell optimizations enabled (TF32, cuDNN benchmark)")

# ============================================================================
# 📝 LOGGING SETUP
# ============================================================================
def setup_logging(output_dir: Path, log_level: int = logging.INFO) -> logging.Logger:
    log_dir = output_dir / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_file = log_dir / f"training_{timestamp}.log"
    
    logger = logging.getLogger("SemanticCloneDetection")
    logger.setLevel(log_level)
    logger.handlers = []
    
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(log_level)
    console_format = logging.Formatter('%(asctime)s | %(levelname)-8s | %(message)s', datefmt='%H:%M:%S')
    console_handler.setFormatter(console_format)
    logger.addHandler(console_handler)
    
    file_handler = logging.FileHandler(log_file)
    file_handler.setLevel(log_level)
    file_format = logging.Formatter('%(asctime)s | %(name)s | %(levelname)-8s | %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
    file_handler.setFormatter(file_format)
    logger.addHandler(file_handler)
    
    logger.info(f"Logging initialized. Log file: {log_file}")
    return logger

# ============================================================================
# 📊 DATASET LOADER
# ============================================================================
class DatasetLoader:
    GPTCLONEBENCH_GDRIVE_ID = "1e6bGxDd1wxd-cELJuDscKWdIODNep4j-"
    GPTCLONEBENCH_GDRIVE_URL = f"https://drive.google.com/uc?id={GPTCLONEBENCH_GDRIVE_ID}"
    CODENET_GDRIVE_ID = "1lEotViEk_-Z7U1Ty-WWcThh26wsn7R7O"
    CODENET_GDRIVE_URL = f"https://drive.google.com/uc?id={CODENET_GDRIVE_ID}"
    
    def __init__(self, datasets_dir: Path, logger: logging.Logger, max_samples: int):
        self.datasets_dir = datasets_dir
        self.logger = logger
        self.max_samples = max_samples
        self.gptclonebench_path = datasets_dir / "gptclonebench" / "gptclonebench_dataset.jsonl"
        self.codenet_path = datasets_dir / "project-codenet" / "project_codenet.jsonl"
    
    def download_gptclonebench(self) -> bool:
        if not GDOWN_AVAILABLE:
            self.logger.error("❌ gdown library not installed. Install with: pip install gdown")
            return False
        if self.gptclonebench_path.exists():
            self.logger.info(f"✓ GPTCloneBench already exists")
            return True
        self.logger.info("📥 Downloading GPTCloneBench...")
        try:
            self.gptclonebench_path.parent.mkdir(parents=True, exist_ok=True)
            temp_file = self.gptclonebench_path.parent / "gptclonebench_download.temp"
            gdown.download(self.GPTCLONEBENCH_GDRIVE_URL, str(temp_file), quiet=False)
            if zipfile.is_zipfile(temp_file):
                with zipfile.ZipFile(temp_file, 'r') as zip_ref:
                    zip_ref.extractall(self.gptclonebench_path.parent)
                temp_file.unlink()
            else:
                temp_file.rename(self.gptclonebench_path)
            if not self.gptclonebench_path.exists():
                jsonl_files = list(self.gptclonebench_path.parent.glob("*.jsonl"))
                if jsonl_files: jsonl_files[0].rename(self.gptclonebench_path)
            return self.gptclonebench_path.exists()
        except Exception as e:
            self.logger.error(f"❌ Download failed: {e}")
            return False
    
    def download_codenet(self) -> bool:
        if not GDOWN_AVAILABLE:
            self.logger.error("❌ gdown library not installed.")
            return False
        if self.codenet_path.exists():
            return True
        self.logger.info("📥 Downloading Project CodeNet...")
        try:
            self.codenet_path.parent.mkdir(parents=True, exist_ok=True)
            temp_file = self.codenet_path.parent / "project_codenet_download.temp"
            gdown.download(self.CODENET_GDRIVE_URL, str(temp_file), quiet=False)
            if zipfile.is_zipfile(temp_file):
                with zipfile.ZipFile(temp_file, 'r') as zip_ref:
                    zip_ref.extractall(self.codenet_path.parent)
                temp_file.unlink()
            else:
                temp_file.rename(self.codenet_path)
            if not self.codenet_path.exists():
                jsonl_files = list(self.codenet_path.parent.glob("*.jsonl"))
                main_files = [f for f in jsonl_files if 'test' not in f.name.lower()]
                if main_files: main_files[0].rename(self.codenet_path)
            return self.codenet_path.exists()
        except Exception as e:
            self.logger.error(f"❌ Download failed: {e}")
            return False
    
    def load_gptclonebench(self, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        if not self.gptclonebench_path.exists():
            if not self.download_gptclonebench(): return []
        pairs = []
        with open(self.gptclonebench_path, 'r', encoding='utf-8') as f:
            for line in f:
                try:
                    data = json.loads(line.strip())
                    pairs.append({
                        'code1': data['code1'], 'code2': data['code2'],
                        'label': 1 if data['semantic'] else 0, 'source': 'gptclonebench'
                    })
                    if limit and len(pairs) >= limit: break
                except: continue
        return pairs
    
    def load_codenet_submissions(self, file_path: Path, limit: Optional[int] = None) -> Dict[str, List[Dict]]:
        if not file_path.exists():
            if not self.download_codenet(): return {}
        problems = defaultdict(list)
        count = 0
        with open(file_path, 'r', encoding='utf-8') as f:
            for line in f:
                try:
                    data = json.loads(line.strip())
                    if (data.get('status') == 'Accepted' and data.get('code') and
                        50 < len(data['code']) < 50000):
                        problems[data['problem_id']].append({
                            'code': data['code'], 'problem_id': data['problem_id'],
                            'language': data['language'], 'user_id': data.get('user_id', 'unknown')
                        })
                        count += 1
                        if limit and count >= limit: break
                except: continue
        return {pid: subs for pid, subs in problems.items() if len(subs) >= 2}
    
    def create_codenet_pairs(self, problems: Dict[str, List[Dict]], num_positive: int, num_negative: int) -> List[Dict[str, Any]]:
        pairs = []
        problem_ids = list(problems.keys())
        positive_count = 0
        for pid in problem_ids:
            subs = problems[pid]
            if len(subs) < 2: continue
            sample_size = min(3, len(subs)*(len(subs)-1)//2)
            sampled = random.sample(list(combinations(subs, 2)), min(sample_size, len(subs)*(len(subs)-1)//2))
            for s1, s2 in sampled:
                if s1['user_id'] == s2['user_id']: continue
                pairs.append({'code1': s1['code'], 'code2': s2['code'], 'label': 1, 'source': 'codenet'})
                positive_count += 1
                if positive_count >= num_positive: break
            if positive_count >= num_positive: break
        
        negative_count = 0
        attempts = 0
        while negative_count < num_negative and attempts < num_negative * 10:
            attempts += 1
            if len(problem_ids) < 2: break
            p1, p2 = random.sample(problem_ids, 2)
            s1, s2 = random.choice(problems[p1]), random.choice(problems[p2])
            pairs.append({'code1': s1['code'], 'code2': s2['code'], 'label': 0, 'source': 'codenet'})
            negative_count += 1
        return pairs
    
    def load_and_balance(self) -> List[Dict[str, Any]]:
        gpt_samples = int(self.max_samples * GPTCLONEBENCH_RATIO)
        code_samples = self.max_samples - gpt_samples
        gpt_pairs = self.load_gptclonebench(limit=gpt_samples)
        code_pos = int(code_samples * CLONE_RATIO)
        code_neg = code_samples - code_pos
        code_probs = self.load_codenet_submissions(self.codenet_path, limit=code_samples*3)
        code_pairs = self.create_codenet_pairs(code_probs, code_pos, code_neg) if code_probs else []
        all_pairs = gpt_pairs + code_pairs
        random.shuffle(all_pairs)
        all_pairs = all_pairs[:self.max_samples]
        self.logger.info(f"✓ Dataset: {len(all_pairs)} pairs, {sum(1 for p in all_pairs if p['label']==1)} clones")
        return all_pairs

# ============================================================================
# 🔄 DATA AUGMENTATION
# ============================================================================
class CodeAugmenter:
    def augment(self, code: str) -> str:
        if not DATA_AUGMENTATION or random.random() > 0.3: return code
        lines = code.split('\n')
        if random.random() < 0.5:
            lines.insert(random.randint(0, len(lines)), "// Augmented")
        return '\n'.join(lines)

# ============================================================================
# 📁 PYTORCH DATASET
# ============================================================================
class SemanticCloneDataset(Dataset):
    def __init__(self, pairs, tokenizer, max_length, augmenter=None):
        self.pairs, self.tokenizer, self.max_length, self.augmenter = pairs, tokenizer, max_length, augmenter
    def __len__(self): return len(self.pairs)
    def __getitem__(self, idx):
        p = self.pairs[idx]
        c1, c2 = p['code1'], p['code2']
        if self.augmenter: c1, c2 = self.augmenter.augment(c1), self.augmenter.augment(c2)
        e1 = self.tokenizer(c1, max_length=self.max_length, padding='max_length', truncation=True, return_tensors='pt')
        e2 = self.tokenizer(c2, max_length=self.max_length, padding='max_length', truncation=True, return_tensors='pt')
        return {
            'input_ids1': e1['input_ids'].squeeze(0), 'attention_mask1': e1['attention_mask'].squeeze(0),
            'input_ids2': e2['input_ids'].squeeze(0), 'attention_mask2': e2['attention_mask'].squeeze(0),
            'labels': torch.tensor(p['label'], dtype=torch.long)
        }

# ============================================================================
# 🧠 MODEL
# ============================================================================
class SemanticCloneModel(nn.Module):
    def __init__(self, model_name, hidden_size, dropout_rate):
        super().__init__()
        self.encoder = AutoModel.from_pretrained(model_name, use_safetensors=True)
        combined = hidden_size * 4
        self.classifier = nn.Sequential(
            nn.Linear(combined, 512), nn.LayerNorm(512), nn.Dropout(dropout_rate), nn.ReLU(),
            nn.Linear(512, 128), nn.LayerNorm(128), nn.Dropout(dropout_rate*0.67), nn.ReLU(),
            nn.Linear(128, 2)
        )
    def forward(self, i1, m1, i2, m2):
        e1 = self.encoder(i1, m1).last_hidden_state[:, 0, :]
        e2 = self.encoder(i2, m2).last_hidden_state[:, 0, :]
        return self.classifier(torch.cat([e1, e2, torch.abs(e1-e2), e1*e2], dim=1))

# ============================================================================
# 🛠️ UTILITIES
# ============================================================================
class LabelSmoothingCrossEntropy(nn.Module):
    def __init__(self, smoothing=0.1):
        super().__init__()
        self.confidence, self.smoothing = 1.0 - smoothing, smoothing
    def forward(self, pred, target):
        lp = F.log_softmax(pred, dim=-1)
        nll = -lp.gather(dim=-1, index=target.unsqueeze(1)).squeeze(1)
        return (self.confidence * nll + self.smoothing * (-lp.mean(dim=-1))).mean()

class EarlyStopping:
    def __init__(self, patience=5, mode='max'):
        self.patience, self.mode, self.counter, self.best, self.stop = patience, mode, 0, None, False
    def __call__(self, score):
        if self.best is None: self.best = score; return False
        if (self.mode=='max' and score > self.best) or (self.mode=='min' and score < self.best):
            self.best, self.counter = score, 0
        else:
            self.counter += 1
            if self.counter >= self.patience: self.stop = True
        return self.stop

class MetricsTracker:
    def __init__(self): self.preds, self.labels, self.losses = [], [], []
    def update(self, p, l, loss):
        self.preds.extend(p.cpu().numpy().tolist())
        self.labels.extend(l.cpu().numpy().tolist())
        self.losses.append(loss)
    def compute(self):
        p, l = np.array(self.preds), np.array(self.labels)
        acc = accuracy_score(l, p)
        _, _, f1, _ = precision_recall_fscore_support(l, p, average='binary', zero_division=0)
        return {'loss': np.mean(self.losses), 'accuracy': acc, 'f1': f1}

class MetricsSaver:
    def __init__(self, m_dir, p_dir, logger):
        self.m_dir, self.p_dir, self.logger = m_dir, p_dir, logger
        m_dir.mkdir(parents=True, exist_ok=True); p_dir.mkdir(parents=True, exist_ok=True)
    def save_epoch_metrics(self, ep, train_m, val_m):
        with open(self.m_dir / f"epoch_{ep:03d}.json", 'w') as f:
            json.dump({'epoch': ep, 'train': train_m, 'val': val_m}, f, indent=2)
    def save_confusion_matrix(self, labels, preds, ep, split='val'):
        cm = confusion_matrix(labels, preds)
        with open(self.m_dir / f"cm_{ep}_{split}.json", 'w') as f:
            json.dump({'cm': cm.tolist()}, f, indent=2)
        fig, ax = plt.subplots(figsize=(6,6))
        sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', ax=ax)
        plt.savefig(self.p_dir / f"cm_{ep}_{split}.png"); plt.close()
    def save_training_history(self, h):
        pd.DataFrame(h).to_csv(self.m_dir / "history.csv", index=False)
    def save_final_evaluation(self, metrics, labels, preds, probs, ep):
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        with open(self.m_dir / f"final_{ts}.json", 'w') as f: json.dump(metrics, f, indent=2)
        pd.DataFrame({'true': labels, 'pred': preds, 'prob': probs}).to_csv(self.m_dir / f"preds_{ts}.csv", index=False)
    def save_summary(self, final_m, best_ep, best_f1, time_mins):
        with open(self.m_dir / "summary.json", 'w') as f:
            json.dump({'best_epoch': best_ep, 'best_f1': best_f1, 'final': final_m, 'time_mins': time_mins}, f, indent=2)

# ============================================================================
# 🏋️ TRAINER
# ============================================================================
class Trainer:
    def __init__(self, model, train_ld, val_ld, test_ld, opt, sched, crit, dev, logger, out_dir, saver):
        self.model, self.train_ld, self.val_ld, self.test_ld = model, train_ld, val_ld, test_ld
        self.opt, self.sched, self.crit, self.dev = opt, sched, crit, dev
        self.logger, self.out_dir, self.saver = logger, out_dir, saver
        self.scaler = GradScaler() if USE_MIXED_PRECISION else None
        self.early_stop = EarlyStopping(patience=EARLY_STOPPING_PATIENCE)
        self.best_f1, self.best_ep = 0.0, 0

    def train_epoch(self, ep):
        self.model.train(); tracker = MetricsTracker()
        for step, b in enumerate(tqdm(self.train_ld, desc=f"Ep {ep}")):
            i1, m1, i2, m2, l = b['input_ids1'].to(self.dev), b['attention_mask1'].to(self.dev), \
                                b['input_ids2'].to(self.dev), b['attention_mask2'].to(self.dev), b['labels'].to(self.dev)
            if USE_MIXED_PRECISION:
                with autocast():
                    loss = self.crit(self.model(i1,m1,i2,m2), l) / GRADIENT_ACCUMULATION_STEPS
                self.scaler.scale(loss).backward()
                if (step+1) % GRADIENT_ACCUMULATION_STEPS == 0:
                    self.scaler.unscale_(self.opt)
                    torch.nn.utils.clip_grad_norm_(self.model.parameters(), 1.0)
                    self.scaler.step(self.opt)
                    self.scaler.update()
                    self.sched.step()
                    self.opt.zero_grad()
                with autocast():
                    preds = torch.argmax(self.model(i1,m1,i2,m2), dim=1)
            else:
                loss = self.crit(self.model(i1,m1,i2,m2), l) / GRADIENT_ACCUMULATION_STEPS
                loss.backward()
                if (step+1) % GRADIENT_ACCUMULATION_STEPS == 0:
                    torch.nn.utils.clip_grad_norm_(self.model.parameters(), 1.0)
                    self.opt.step()
                    self.sched.step()
                    self.opt.zero_grad()
                preds = torch.argmax(self.model(i1,m1,i2,m2), dim=1)
            tracker.update(preds, l, loss.item()*GRADIENT_ACCUMULATION_STEPS)
        return tracker.compute()

    @torch.no_grad()
    def evaluate(self, ld, desc, ep, split='val'):
        self.model.eval()
        tracker = MetricsTracker()
        all_l, all_p = [], []
        for b in tqdm(ld, desc=desc):
            logits = self.model(b['input_ids1'].to(self.dev), b['attention_mask1'].to(self.dev),
                                b['input_ids2'].to(self.dev), b['attention_mask2'].to(self.dev))
            loss = self.crit(logits, b['labels'].to(self.dev))
            preds = torch.argmax(logits, dim=1)
            tracker.update(preds, b['labels'], loss.item())
            all_l.extend(b['labels'].cpu().numpy().tolist())
            all_p.extend(preds.cpu().numpy().tolist())
        if split=='val' and ep>0:
            self.saver.save_confusion_matrix(np.array(all_l), np.array(all_p), ep, split)
        return tracker.compute()

    def train(self):
        hist = {'train_loss':[], 'train_f1':[], 'val_loss':[], 'val_f1':[]}
        start = time.time()
        for ep in range(1, NUM_EPOCHS+1):
            tm = self.train_epoch(ep)
            vm = self.evaluate(self.val_ld, f"Ep {ep} Val", ep)
            self.logger.info(f"Ep {ep}: Train F1={tm['f1']:.4f}, Val F1={vm['f1']:.4f}")
            self.saver.save_epoch_metrics(ep, tm, vm)
            for k,v in [('train_loss',tm['loss']),('train_f1',tm['f1']),('val_loss',vm['loss']),('val_f1',vm['f1'])]:
                hist[k].append(v)
            
            ckpt_dir = self.out_dir / "checkpoints"
            ckpt_dir.mkdir(parents=True, exist_ok=True)
            torch.save({'epoch':ep, 'model_state_dict':self.model.state_dict(), 'metrics':vm}, ckpt_dir/f"ckpt_{ep}.pt")
            if vm['f1'] > self.best_f1:
                self.best_f1, self.best_ep = vm['f1'], ep
                torch.save({'epoch':ep, 'model_state_dict':self.model.state_dict(), 'metrics':vm}, ckpt_dir/"best_model.pt")
                self.logger.info(f"  ✓ New Best! F1={self.best_f1:.4f}")
            if self.early_stop(vm['f1']):
                self.logger.info("Early Stop")
                break
        self.saver.save_training_history(hist)
        return hist, time.time()-start

    def load_checkpoint(self, path):
        ckpt = torch.load(path, map_location=self.dev, weights_only=False)
        self.model.load_state_dict(ckpt['model_state_dict'])
        return ckpt['epoch'], ckpt['metrics']

# ============================================================================
# 📊 EVALUATOR
# ============================================================================
class Evaluator:
    def __init__(self, model, ld, dev, logger, saver):
        self.model, self.ld, self.dev, self.saver = model, ld, dev, saver
    @torch.no_grad()
    def evaluate_comprehensive(self, ep):
        self.model.eval(); all_l, all_p, all_pr = [], [], []
        for b in tqdm(self.ld, desc="Eval"):
            logits = self.model(b['input_ids1'].to(self.dev), b['attention_mask1'].to(self.dev),
                                b['input_ids2'].to(self.dev), b['attention_mask2'].to(self.dev))
            probs = F.softmax(logits, dim=1); preds = torch.argmax(logits, dim=1)
            all_l.extend(b['labels'].cpu().numpy().tolist())
            all_p.extend(preds.cpu().numpy().tolist())
            all_pr.extend(probs[:,1].cpu().numpy().tolist())
        l, p, pr = np.array(all_l), np.array(all_p), np.array(all_pr)
        metrics = {'accuracy': float(accuracy_score(l,p)), 'f1': float(precision_recall_fscore_support(l,p,average='binary')[2]),
                   'roc_auc': float(roc_auc_score(l,pr)) if len(np.unique(l))>1 else 0.0}
        self.saver.save_final_evaluation(metrics, l, p, pr, ep)
        return metrics

# ============================================================================
# 💾 MODEL EXPORTER (FIXED LOGIC)
# ============================================================================
class ModelExporter:
    def __init__(self, out_dir, logger):
        self.out_dir, self.logger = out_dir, logger
        self.export_dir = out_dir / "exported_model"

    def export(self, checkpoint_path: Optional[Path] = None):
        self.export_dir.mkdir(parents=True, exist_ok=True)
        ckpt_dir = self.out_dir / "checkpoints"
        
        # FIX: Robust Checkpoint Selection
        if checkpoint_path and checkpoint_path.exists():
            selected_ckpt = checkpoint_path
            self.logger.info(f"Using specified checkpoint: {selected_ckpt}")
        else:
            best_ckpt = ckpt_dir / "best_model.pt"
            if best_ckpt.exists():
                selected_ckpt = best_ckpt
                self.logger.info(f"Using best_model.pt")
            else:
                # Fallback to latest checkpoint
                ckpts = sorted(ckpt_dir.glob("ckpt_*.pt"), key=lambda x: int(x.stem.split('_')[1]), reverse=True)
                if ckpts:
                    selected_ckpt = ckpts[0]
                    self.logger.warning(f"⚠️ best_model.pt not found! Using latest: {selected_ckpt.name}")
                else:
                    self.logger.error("❌ No checkpoints found to export!")
                    return

        self.logger.info(f"Loading checkpoint from {selected_ckpt}")
        try:
            ckpt = torch.load(selected_ckpt, map_location='cpu', weights_only=False)
        except Exception as e:
            self.logger.error(f"Failed to load checkpoint: {e}")
            return

        model = SemanticCloneModel(MODEL_NAME, HIDDEN_SIZE, DROPOUT_RATE)
        model.load_state_dict(ckpt['model_state_dict']); model.eval()
        
        torch.save({'model_state_dict': model.state_dict(), 'epoch': ckpt.get('epoch'), 'metrics': ckpt.get('metrics'),
                    'config': {'model_name': MODEL_NAME, 'max_length': MAX_LENGTH, 'hidden_size': HIDDEN_SIZE, 'dropout_rate': DROPOUT_RATE}},
                   self.export_dir / "model.pt")
        
        tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
        tokenizer.save_pretrained(self.export_dir / "tokenizer")
        
        with open(self.export_dir / "config.json", 'w') as f:
            json.dump({'model_name': MODEL_NAME, 'max_length': MAX_LENGTH, 'hidden_size': HIDDEN_SIZE, 
                       'dropout_rate': DROPOUT_RATE, 'epoch': ckpt.get('epoch')}, f, indent=2)
        
        self.logger.info(f"✅ Model exported to {self.export_dir}")

# ============================================================================
# 🎯 MAIN
# ============================================================================
def set_seed(s):
    random.seed(s); np.random.seed(s); torch.manual_seed(s)
    if torch.cuda.is_available(): torch.cuda.manual_seed_all(s)

def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument('--mode', default='full', choices=['full','resume','evaluate','download-only'])
    p.add_argument('--checkpoint', type=str, default=None)
    p.add_argument('--epochs', type=int, default=NUM_EPOCHS)
    p.add_argument('--batch-size', type=int, default=BATCH_SIZE)
    p.add_argument('--max-samples', type=int, default=MAX_SAMPLES)
    p.add_argument('--export-only', action='store_true')
    p.add_argument('--no-cuda', action='store_true')
    return p.parse_args()

def main():
    args = parse_args()
    global NUM_EPOCHS, BATCH_SIZE, MAX_SAMPLES
    NUM_EPOCHS, BATCH_SIZE, MAX_SAMPLES = args.epochs, args.batch_size, args.max_samples
    
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    logger = setup_logging(OUTPUT_DIR)
    set_seed(RANDOM_SEED)
    
    device = torch.device('cuda' if torch.cuda.is_available() and not args.no_cuda else 'cpu')
    logger.info(f"Device: {device}")
    if device.type == 'cuda': optimize_for_rtx6000(logger)

    if args.mode == 'download-only':
        loader = DatasetLoader(DATASETS_DIR, logger, MAX_SAMPLES)
        loader.download_gptclonebench(); loader.download_codenet()
        return

    # Data Loading
    logger.info("STEP 1: Loading Data")
    loader = DatasetLoader(DATASETS_DIR, logger, MAX_SAMPLES)
    all_pairs = loader.load_and_balance()
    if not all_pairs: logger.error("No data!"); return

    logger.info("STEP 2: Splitting")
    tv, test = train_test_split(all_pairs, test_size=TEST_RATIO, stratify=[p['label'] for p in all_pairs], random_state=RANDOM_SEED)
    tr, val = train_test_split(tv, test_size=VAL_RATIO/(TRAIN_RATIO+VAL_RATIO), stratify=[p['label'] for p in tv], random_state=RANDOM_SEED)
    logger.info(f"Train:{len(tr)}, Val:{len(val)}, Test:{len(test)}")

    if args.export_only:
        for n,d in [('train',tr),('val',val),('test',test)]:
            with open(OUTPUT_DIR/f"{n}.jsonl",'w') as f:
                for x in d: f.write(json.dumps(x)+'\n')
        logger.info("Exported splits."); return

    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    aug = CodeAugmenter() if DATA_AUGMENTATION else None
    tr_ds = SemanticCloneDataset(tr, tokenizer, MAX_LENGTH, aug)
    val_ds = SemanticCloneDataset(val, tokenizer, MAX_LENGTH)
    test_ds = SemanticCloneDataset(test, tokenizer, MAX_LENGTH)
    
    tr_ld = DataLoader(tr_ds, batch_size=BATCH_SIZE, shuffle=True, num_workers=NUM_WORKERS, pin_memory=PIN_MEMORY)
    val_ld = DataLoader(val_ds, batch_size=EVAL_BATCH_SIZE, shuffle=False, num_workers=NUM_WORKERS, pin_memory=PIN_MEMORY)
    test_ld = DataLoader(test_ds, batch_size=EVAL_BATCH_SIZE, shuffle=False, num_workers=NUM_WORKERS, pin_memory=PIN_MEMORY)

    model = SemanticCloneModel(MODEL_NAME, HIDDEN_SIZE, DROPOUT_RATE).to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=LEARNING_RATE, weight_decay=WEIGHT_DECAY)
    steps = len(tr_ld) * NUM_EPOCHS // GRADIENT_ACCUMULATION_STEPS
    sched = get_linear_schedule_with_warmup(opt, int(steps*WARMUP_RATIO), steps)
    crit = LabelSmoothingCrossEntropy(LABEL_SMOOTHING)
    
    saver = MetricsSaver(OUTPUT_DIR/"results"/"metrics", OUTPUT_DIR/"results"/"plots", logger)
    trainer = Trainer(model, tr_ld, val_ld, test_ld, opt, sched, crit, device, logger, OUTPUT_DIR, saver)

    if args.mode == 'resume' and args.checkpoint:
        logger.info("Resuming...")
        ep, _ = trainer.load_checkpoint(Path(args.checkpoint))
        trainer.train() # Simplified resume
    else:
        logger.info("STEP 7: Training")
        trainer.train()

    logger.info("STEP 8: Eval & Export")
    best_ckpt = OUTPUT_DIR / "checkpoints" / "best_model.pt"
    
    # Safe Export Call
    exporter = ModelExporter(OUTPUT_DIR, logger)
    exporter.export(best_ckpt) # Pass path, exporter handles missing file gracefully

    if best_ckpt.exists():
        trainer.load_checkpoint(best_ckpt)
        evaluator = Evaluator(model, test_ld, device, logger, saver)
        fm = evaluator.evaluate_comprehensive(trainer.best_ep)
        logger.info(f"Test F1: {fm['f1']:.4f}")
        saver.save_summary(fm, trainer.best_ep, trainer.best_f1, 0)

    logger.info("✅ PIPELINE COMPLETE")

if __name__ == "__main__":
    main()