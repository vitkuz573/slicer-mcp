"""Render top-view thumbnail PNG of an STL, with optional rotation/scale.

Usage: render_thumb.py MODEL.stl OUT.png [--rotate-x D] [--rotate-y D] [--rotate-z D] [--scale PCT] [--size PX]
"""
import argparse
import sys

import numpy as np
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection


def load_stl(path):
    with open(path, "rb") as f:
        f.seek(80)
        n = np.frombuffer(f.read(4), dtype=np.uint32)[0]
        raw = np.frombuffer(f.read(int(n) * 50), dtype=np.uint8)
    tris = raw.reshape(int(n), 50)
    verts = np.zeros((int(n), 3, 3), dtype=np.float32)
    for i in range(3):
        for j in range(3):
            b = tris[:, 12 + (i * 3 + j) * 4:12 + (i * 3 + j) * 4 + 4]
            verts[:, i, j] = np.frombuffer(b.tobytes(), dtype=np.float32)
    return verts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("model")
    ap.add_argument("out")
    ap.add_argument("--rotate-x", type=float, default=0.0)
    ap.add_argument("--rotate-y", type=float, default=0.0)
    ap.add_argument("--rotate-z", type=float, default=0.0)
    ap.add_argument("--scale", type=float, default=100.0)
    ap.add_argument("--size", type=int, default=300)
    a = ap.parse_args()

    verts = load_stl(a.model)
    rx, ry, rz = np.radians([a.rotate_x, a.rotate_y, a.rotate_z])

    def rot_x(v):
        c, s = np.cos(rx), np.sin(rx)
        y = v[:, :, 1] * c - v[:, :, 2] * s
        z = v[:, :, 1] * s + v[:, :, 2] * c
        v[:, :, 1], v[:, :, 2] = y, z

    def rot_y(v):
        c, s = np.cos(ry), np.sin(ry)
        x = v[:, :, 0] * c + v[:, :, 2] * s
        z = -v[:, :, 0] * s + v[:, :, 2] * c
        v[:, :, 0], v[:, :, 2] = x, z

    def rot_z(v):
        c, s = np.cos(rz), np.sin(rz)
        x = v[:, :, 0] * c - v[:, :, 1] * s
        y = v[:, :, 0] * s + v[:, :, 1] * c
        v[:, :, 0], v[:, :, 1] = x, y

    rot_x(verts)
    rot_y(verts)
    rot_z(verts)
    verts *= a.scale / 100.0
    verts[:, :, 2] -= verts[:, :, 2].min()

    n = len(verts)
    sub = verts[:: max(1, n // 80000)][:, :, :2]
    fig = plt.figure(figsize=(a.size / 100, a.size / 100), dpi=100)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(sub[:, :, 0].min() - 1, sub[:, :, 0].max() + 1)
    ax.set_ylim(sub[:, :, 1].min() - 1, sub[:, :, 1].max() + 1)
    ax.set_aspect("equal")
    ax.axis("off")
    fig.patch.set_facecolor("white")
    ax.add_collection(PolyCollection(sub, facecolor=(0.15, 0.15, 0.15), edgecolor="none"))
    plt.savefig(a.out, dpi=100)
    print("png ok", a.out)


main()
