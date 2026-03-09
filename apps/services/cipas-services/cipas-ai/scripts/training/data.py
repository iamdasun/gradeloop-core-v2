#!/usr/bin/env python3
"""
DroidDetect AI Code Detector - STABLE BLACKWELL VERSION
Hardened for saving and metrics calculation.
"""
import os
import json
import warnings
import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import seaborn as sns
import matplotlib.pyplot as plt
from sklearn.metrics import (
    accuracy_score, 
    confusion_matrix, 
    precision_recall_fscore_support, 
    roc_auc_score
)
from sklearn.model_selection import train_test_split
from transformers import (
    AutoModel, 
    AutoTokenizer, 
    Trainer, 
    TrainingArguments, 
    set_seed
)
from datasets import Dataset, load_dataset

warnings.filterwarnings("ignore")
set_seed(42)

# ----------------------------------------------------
# CONFIG
# ----------------------------------------------------
MODEL_NAME = "microsoft/unixcoder-base"
MAX_LENGTH = 256
SAVE_DIR = "./unixcoder-droiddetect-final"
OUTPUT_DIR = "./unixcoder-droiddetect-checkpoints"
CONTRASTIVE_WEIGHT = 0.05

os.makedirs(SAVE_DIR, exist_ok=True)

# Blackwell Optimization
if torch.cuda.is_available():
    torch.backends.cuda.matmul.allow_tf32 = True
    torch.backends.cudnn.allow_tf32 = True
    torch.set_float32_matmul_precision("high")

# ----------------------------------------------------
# MODEL (Inheriting from PreTrainedModel for save_pretrained)
# ----------------------------------------------------
class UniXcoderClassifier(nn.Module):
    def __init__(self, base_model):
        super().__init__()
        self.encoder = AutoModel.from_pretrained(base_model)
        self.config = self.encoder.config # Required for HF compatibility
        self.classifier = nn.Linear(self.config.hidden_size, 2)

    def forward(self, input_ids=None, attention_mask=None, labels=None, **kwargs):
        # PEFT/Compile recovery logic
        idx = input_ids if input_ids is not None else kwargs.get("input_ids")
        mask = attention_mask if attention_mask is not None else kwargs.get("attention_mask")

        outputs = self.encoder(input_ids=idx, attention_mask=mask)
        features = outputs.last_hidden_state[:, 0, :]
        logits = self.classifier(features)

        loss = None
        if labels is not None:
            ce = F.cross_entropy(logits, labels)
            contrastive = supervised_contrastive_loss(features, labels)
            loss = ce + CONTRASTIVE_WEIGHT * contrastive

        return {"loss": loss, "logits": logits}

    # FIX: Add save_pretrained capability
    def save_pretrained(self, save_directory, **kwargs):
        os.makedirs(save_directory, exist_ok=True)
        # Save the model weights
        state_dict = self.state_dict()
        # Filter out compiled prefixes if present
        clean_state_dict = {k.replace("_orig_mod.", ""): v for k, v in state_dict.items()}
        torch.save(clean_state_dict, os.path.join(save_directory, "pytorch_model.bin"))
        # Save the config
        self.config.save_pretrained(save_directory)

# ----------------------------------------------------
# LOSSES & METRICS
# ----------------------------------------------------
def supervised_contrastive_loss(features, labels):
    features = F.normalize(features, dim=1)
    sim = torch.matmul(features, features.T) / 0.07
    mask = torch.eq(labels.unsqueeze(1), labels.unsqueeze(0)).float()
    mask.fill_diagonal_(0)
    exp_sim = torch.exp(sim)
    log_prob = sim - torch.log(exp_sim.sum(dim=1, keepdim=True) + 1e-8)
    return -(mask * log_prob).sum(1).mean() / (mask.sum(1).mean() + 1e-8)

def compute_metrics(p):
    logits = p.predictions
    # Robust unpacking for compiled output
    if isinstance(logits, tuple):
        logits = logits[0]
    
    preds = np.argmax(logits, axis=1)
    labels = p.label_ids
    
    # zero_division=0 ensures we don't get 1.0 when nothing is predicted
    precision, recall, f1, _ = precision_recall_fscore_support(
        labels, preds, average="binary", zero_division=0
    )
    
    return {
        "accuracy": accuracy_score(labels, preds),
        "f1": f1,
        "precision": precision,
        "recall": recall
    }

# ----------------------------------------------------
# MAIN
# ----------------------------------------------------
def main():
    device = "cuda" if torch.cuda.is_available() else "cpu"
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = UniXcoderClassifier(MODEL_NAME)

    if hasattr(torch, "compile"):
        print("🚀 Compiling backbone for Blackwell")
        model.encoder = torch.compile(model.encoder)

    model.to(device)

    # Data
    ds = load_dataset("project-droid/DroidCollection", split="train").to_pandas()[["Code", "Label"]]
    ds = ds.rename(columns={"Code": "code", "Label": "label"}).dropna()
    ds["label"] = ds["label"].astype(str).str.lower().map({
        "human_generated": 0, "machine_generated": 1, 
        "machine_refined": 1, "machine_generated_adversarial": 1
    })
    
    df = ds.sample(min(len(ds), 100000), random_state=42)
    train_df, val_df = train_test_split(df, test_size=0.05, stratify=df.label)

    def tok_fn(ex):
        return tokenizer(ex["code"], truncation=True, padding="max_length", max_length=MAX_LENGTH)

    train_ds = Dataset.from_pandas(train_df).map(tok_fn, batched=True, remove_columns=["code"])
    val_ds = Dataset.from_pandas(val_df).map(tok_fn, batched=True, remove_columns=["code"])

    args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        num_train_epochs=4,
        per_device_train_batch_size=128,
        per_device_eval_batch_size=128,
        learning_rate=2e-5,
        bf16=True, tf32=True,
        optim="adamw_torch_fused",
        dataloader_num_workers=8,
        eval_strategy="steps",
        eval_steps=200,
        save_steps=200,
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        save_total_limit=1,
        remove_unused_columns=False,
        report_to=[]
    )

    trainer = Trainer(
        model=model, args=args, train_dataset=train_ds, 
        eval_dataset=val_ds, compute_metrics=compute_metrics
    )

    print("\n--- TRAINING START ---\n")
    trainer.train()

    # Final Eval & Plots
    preds = trainer.predict(val_ds)
    logits = preds.predictions[0] if isinstance(preds.predictions, tuple) else preds.predictions
    probs = torch.softmax(torch.tensor(logits), dim=1)[:, 1].numpy()
    labels = preds.label_ids
    
    auc = roc_auc_score(labels, probs)
    cm = confusion_matrix(labels, (probs > 0.5).astype(int))

    plt.figure(figsize=(6, 5))
    sns.heatmap(cm, annot=True, fmt="d", cmap="Blues", xticklabels=["H", "AI"], yticklabels=["H", "AI"])
    plt.savefig(os.path.join(SAVE_DIR, "confusion_matrix.png"))

    # FIX: Use the new manual save_pretrained or torch.save
    model.save_pretrained(SAVE_DIR)
    tokenizer.save_pretrained(SAVE_DIR)

    with open(os.path.join(SAVE_DIR, "metrics.json"), "w") as f:
        json.dump({"auc": float(auc)}, f, indent=4)

    print(f"\n✅ Training complete. AUC: {auc:.4f}. Model saved to {SAVE_DIR}")

if __name__ == "__main__":
    main()