from pathlib import Path

from src.reference_forge.blender_script import write_blender_setup
from src.reference_forge.models import VehicleSpec
from src.reference_forge.project import ProjectBuilder


def sample_spec() -> VehicleSpec:
    return VehicleSpec(
        make="BMW",
        model="1M Coupe",
        year=2011,
        length_mm=4373,
        width_mm=1956,
        height_mm=1400,
        wheelbase_mm=2660,
    )


def test_project_builder_creates_expected_structure(tmp_path: Path) -> None:
    project = ProjectBuilder(tmp_path).create(sample_spec())
    assert (project / "vehicle.json").exists()
    assert (project / "references" / "blueprints").is_dir()
    assert (project / "references" / "photos").is_dir()
    assert (project / "export" / "stl").is_dir()


def test_blender_script_is_generated(tmp_path: Path) -> None:
    spec = sample_spec()
    project = ProjectBuilder(tmp_path).create(spec)
    script = write_blender_setup(project, spec)
    text = script.read_text(encoding="utf-8")
    assert "VEHICLE_GUIDE" in text
    assert "4373" in text
    assert "2660" in text


def test_invalid_dimensions_fail(tmp_path: Path) -> None:
    spec = sample_spec()
    spec.length_mm = 0
    project = ProjectBuilder(tmp_path).create(spec)
    try:
        write_blender_setup(project, spec)
        assert False, "Expected ValueError"
    except ValueError:
        assert True
