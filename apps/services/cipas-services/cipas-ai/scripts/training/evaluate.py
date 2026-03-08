import os
import torch
from tqdm import tqdm
from datasets import load_dataset
from transformers import AutoTokenizer, AutoModel
from sklearn.metrics import (
    accuracy_score, precision_recall_fscore_support,
    roc_auc_score, confusion_matrix, ConfusionMatrixDisplay
)
from torch.utils.data import DataLoader
import torch.nn as nn
import matplotlib.pyplot as plt
from pathlib import Path

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

MODEL_DIR = Path("unixcoder-droiddetect-final")  # <-- folder where model/tokenizer are saved
MAX_LEN = 512
BATCH_SIZE = 64


# -----------------------------
# Model Architecture
# -----------------------------
class CodeClassifier(nn.Module):
    def __init__(self, model_name="microsoft/unixcoder-base"):
        super().__init__()
        self.encoder = AutoModel.from_pretrained(model_name)
        hidden = self.encoder.config.hidden_size
        self.classifier = nn.Linear(hidden, 2)

    def forward(self, input_ids, attention_mask):
        outputs = self.encoder(
            input_ids=input_ids,
            attention_mask=attention_mask
        )
        cls = outputs.last_hidden_state[:, 0]
        logits = self.classifier(cls)
        return logits


# -----------------------------
# Preprocess dataset
# -----------------------------
def preprocess(example, tokenizer):
    text = example["code"]
    enc = tokenizer(
        text,
        truncation=True,
        padding="max_length",
        max_length=MAX_LEN
    )
    enc["labels"] = example["label"]
    return enc


# -----------------------------
# Save confusion matrix
# -----------------------------
def save_confusion_matrix(labels, preds, task_name):
    cm = confusion_matrix(labels, preds)
    disp = ConfusionMatrixDisplay(cm, display_labels=["Human", "AI"])
    fig, ax = plt.subplots(figsize=(6, 6))
    disp.plot(ax=ax, cmap="Blues", colorbar=False)
    plt.title(f"AICD-Bench {task_name} Confusion Matrix")
    os.makedirs("results", exist_ok=True)
    path = f"results/confusion_matrix_{task_name}.png"
    plt.savefig(path, dpi=300, bbox_inches="tight")
    plt.close()
    print(f"Saved confusion matrix → {path}")


# -----------------------------
# Evaluation function
# -----------------------------
def evaluate(model, dataset, tokenizer):
    dataset = dataset.map(
        lambda x: preprocess(x, tokenizer),
        remove_columns=dataset.column_names
    )
    dataset.set_format(
        type="torch",
        columns=["input_ids", "attention_mask", "labels"]
    )
    loader = DataLoader(dataset, batch_size=BATCH_SIZE)
    preds, probs, labels = [], [], []

    model.eval()
    with torch.no_grad():
        for batch in tqdm(loader):
            input_ids = batch["input_ids"].to(DEVICE)
            mask = batch["attention_mask"].to(DEVICE)
            y = batch["labels"].to(DEVICE)
            logits = model(input_ids, mask)
            p = torch.softmax(logits, dim=1)[:, 1]
            pred = torch.argmax(logits, dim=1)
            preds.extend(pred.cpu().numpy())
            probs.extend(p.cpu().numpy())
            labels.extend(y.cpu().numpy())

    accuracy = accuracy_score(labels, preds)
    precision, recall, f1, _ = precision_recall_fscore_support(
        labels, preds, average="binary", zero_division=0
    )
    auc = roc_auc_score(labels, probs)

    return {
        "accuracy": accuracy,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "auc": auc,
        "labels": labels,
        "preds": preds
    }


# -----------------------------
# Main
# -----------------------------
def main():
    print("Loading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(str(MODEL_DIR))

    print("Loading model...")
    model = CodeClassifier()
    model_path = MODEL_DIR / "pytorch_model.bin"
    model.load_state_dict(torch.load(model_path, map_location=DEVICE))
    model.to(DEVICE)

    benchmarks = ["T1", "T2", "T3"]
    for task in benchmarks:
        print(f"\n===== Evaluating AICD-Bench {task} =====")
        ds = load_dataset("AICD-bench/AICD-Bench", task)
        test_set = ds["test"]

        results = evaluate(model, test_set, tokenizer)
        labels = results.pop("labels")
        preds = results.pop("preds")

        for k, v in results.items():
            print(f"{k}: {v:.4f}")

        save_confusion_matrix(labels, preds, task)


if __name__ == "__main__":
    main()