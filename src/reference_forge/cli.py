from __future__ import annotations

import argparse
from pathlib import Path

from .blender_script import write_blender_setup
from .models import VehicleSpec
from .project import ProjectBuilder


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Reference Forge - prepara projetos de veículos para Blender")
    parser.add_argument("--make", required=True, help="Marca")
    parser.add_argument("--model", required=True, help="Modelo")
    parser.add_argument("--year", required=True, type=int, help="Ano")
    parser.add_argument("--length", required=True, type=float, help="Comprimento em mm")
    parser.add_argument("--width", required=True, type=float, help="Largura em mm")
    parser.add_argument("--height", required=True, type=float, help="Altura em mm")
    parser.add_argument("--wheelbase", required=True, type=float, help="Entre-eixos em mm")
    parser.add_argument("--output", default="projects", help="Pasta dos projetos")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    spec = VehicleSpec(
        make=args.make,
        model=args.model,
        year=args.year,
        length_mm=args.length,
        width_mm=args.width,
        height_mm=args.height,
        wheelbase_mm=args.wheelbase,
    )
    project_dir = ProjectBuilder(Path(args.output)).create(spec)
    script = write_blender_setup(project_dir, spec)
    print(f"Projeto criado: {project_dir}")
    print(f"Script Blender: {script}")
    print(f"Execute: blender --background --python \"{script}\"")


if __name__ == "__main__":
    main()
