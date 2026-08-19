from __future__ import annotations

import json
from pathlib import Path

from .models import VehicleSpec


class ProjectBuilder:
    """Cria a estrutura padronizada de um projeto de veículo."""

    DIRECTORIES = (
        "references/blueprints",
        "references/photos",
        "blender",
        "export/stl",
        "sources",
    )

    def __init__(self, root: Path) -> None:
        self.root = root

    def create(self, spec: VehicleSpec) -> Path:
        project_dir = self.root / spec.slug
        for directory in self.DIRECTORIES:
            (project_dir / directory).mkdir(parents=True, exist_ok=True)

        metadata = project_dir / "vehicle.json"
        metadata.write_text(
            json.dumps(spec.to_dict(), indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

        sources = project_dir / "sources" / "README.md"
        if not sources.exists():
            sources.write_text(
                "# Fontes\n\nRegistre aqui URLs, licença e observações de cada blueprint/foto usada.\n",
                encoding="utf-8",
            )
        return project_dir
