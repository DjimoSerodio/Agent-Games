/**
 * Nexus 3D Hex Map Renderer
 *
 * Three.js-based 3D rendering for the Tragedy of the Commons hex map.
 * Provides:
 * - 3D extruded hex tiles with terrain colors
 * - Camera controls (orbit, pan, zoom)
 * - Animated production effects
 * - Agent avatars on structures
 * - Ecosystem health visualization
 *
 * Usage:
 *   const renderer = new NexusMap3D(containerElement);
 *   renderer.initialize(state);
 *   renderer.update(state);
 *   renderer.startAnimation();
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export interface HexTile3D {
  q: number;
  r: number;
  terrain: string;
  productionNumber: number;
  revealed?: boolean;
}

export interface Structure3D {
  type: "village" | "township" | "city" | "beacon" | "trade_post" | "road";
  owner: string;
  hexes: Array<{ q: number; r: number }>;
  regionId?: string;
}

export interface Region3D {
  id: string;
  name: string;
  coord: { q: number; r: number };
  primaryResource: string;
  productionNumber: number;
  biome: string;
}

export interface MapState3D {
  hexes: HexTile3D[];
  regions: Region3D[];
  structures: Structure3D[];
  productionNumber: number;
  wheelPosition: number;
  agentPositions: Record<string, { q: number; r: number }>;
}

export interface Ecosystem3D {
  id: string;
  name: string;
  health: number;
  status: "flourishing" | "stable" | "strained" | "collapsed";
}

const TERRAIN_COLORS: Record<string, { base: number; dark: number; accent: number }> = {
  plains:   { base: 0x8fbc8f, dark: 0x556b2f, accent: 0x9acd32 },
  forest:   { base: 0x228b22, dark: 0x006400, accent: 0x32cd32 },
  mountains: { base: 0x8b8b83, dark: 0x696969, accent: 0xb8b8b8 },
  rivers:   { base: 0x4682b4, dark: 0x1e3a5f, accent: 0x87ceeb },
  commons:  { base: 0xdda0dd, dark: 0x8b4789, accent: 0xee82ee },
  wasteland: { base: 0x8b7355, dark: 0x5c4033, accent: 0xa0826d },
};

const STRUCTURE_HEX_HEIGHT = {
  village: 0.15,
  township: 0.25,
  city: 0.4,
  beacon: 0.3,
  trade_post: 0.2,
  road: 0.05,
};

const STRUCTURE_COLORS = {
  village: 0xdda0dd,
  township: 0xdaa520,
  city: 0xb8860b,
  beacon: 0x4169e1,
  trade_post: 0x2e8b57,
  road: 0x8b4513,
};

export class NexusMap3D {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private container: HTMLElement;

  private hexMeshes: Map<string, THREE.Mesh> = new Map();
  private structureMeshes: Map<string, THREE.Group> = new Map();
  private agentMeshes: Map<string, THREE.Mesh> = new Map();
  private productionParticleSystem: THREE.Points | null = null;

  private animationId: number = 0;
  private clock: THREE.Clock;
  private isAnimating = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.clock = new THREE.Clock();

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07111b);

    // Camera
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    this.camera.position.set(0, 50, 50);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2.2;
    this.controls.minDistance = 20;
    this.controls.maxDistance = 150;

    // Lights
    this.setupLights();

    // Ground plane
    this.setupGround();

    // Resize handler
    window.addEventListener("resize", this.onResize.bind(this));
  }

  private setupLights(): void {
    // Ambient light
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambient);

    // Main directional light
    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    mainLight.position.set(30, 50, 30);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 200;
    mainLight.shadow.camera.left = -60;
    mainLight.shadow.camera.right = 60;
    mainLight.shadow.camera.top = 60;
    mainLight.shadow.camera.bottom = -60;
    this.scene.add(mainLight);

    // Fill light
    const fillLight = new THREE.DirectionalLight(0x88aaff, 0.3);
    fillLight.position.set(-30, 20, -30);
    this.scene.add(fillLight);

    // Rim light
    const rimLight = new THREE.DirectionalLight(0xffddaa, 0.2);
    rimLight.position.set(0, 10, -50);
    this.scene.add(rimLight);
  }

  private setupGround(): void {
    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x0a1520,
      roughness: 0.9,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  public initialize(state: MapState3D): void {
    // Clear existing meshes
    this.clearMeshes();

    // Create hex tiles
    for (const hex of state.hexes) {
      this.createHexMesh(hex);
    }

    // Create structures
    for (const structure of state.structures) {
      this.createStructureMesh(structure);
    }

    // Create agent markers
    for (const [agentId, position] of Object.entries(state.agentPositions)) {
      this.createAgentMesh(agentId, position.q, position.r);
    }

    // Position camera to fit all hexes
    this.fitCameraToHexes(state.hexes);
  }

  public update(state: MapState3D): void {
    // Update hex production highlights
    for (const hex of state.hexes) {
      const key = `${hex.q},${hex.r}`;
      const mesh = this.hexMeshes.get(key);
      if (mesh) {
        const isProducing = hex.productionNumber === state.productionNumber;
        const material = mesh.material as THREE.MeshStandardMaterial;
        
        // Pulse effect for producing hexes
        if (isProducing && hex.terrain !== "wasteland") {
          const pulse = 0.7 + 0.3 * Math.sin(this.clock.elapsedTime * 3);
          material.emissive.setHex(0x444400);
          material.emissiveIntensity = pulse * 0.3;
        } else {
          material.emissive.setHex(0x000000);
          material.emissiveIntensity = 0;
        }
      }
    }

    // Update agent positions
    for (const [agentId, position] of Object.entries(state.agentPositions)) {
      const mesh = this.agentMeshes.get(agentId);
      if (mesh) {
        const pos = this.hexToWorld(position.q, position.r);
        mesh.position.x = pos.x;
        mesh.position.z = pos.z;
      }
    }
  }

  private clearMeshes(): void {
    for (const mesh of this.hexMeshes.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.hexMeshes.clear();

    for (const group of this.structureMeshes.values()) {
      this.scene.remove(group);
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
    }
    this.structureMeshes.clear();

    for (const mesh of this.agentMeshes.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.agentMeshes.clear();
  }

  private createHexMesh(hex: HexTile3D): void {
    const key = `${hex.q},${hex.r}`;
    const terrain = TERRAIN_COLORS[hex.terrain] || TERRAIN_COLORS.wasteland;

    // Hex geometry (flat-top orientation)
    const hexGeometry = new THREE.CylinderGeometry(1, 1, 0.2, 6, 1);
    
    const material = new THREE.MeshStandardMaterial({
      color: terrain.base,
      roughness: 0.8,
      metalness: 0.1,
      flatShading: true,
    });

    const mesh = new THREE.Mesh(hexGeometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const pos = this.hexToWorld(hex.q, hex.r);
    mesh.position.set(pos.x, 0, pos.z);
    mesh.rotation.y = Math.PI / 6;

    this.scene.add(mesh);
    this.hexMeshes.set(key, mesh);
  }

  private createStructureMesh(structure: Structure3D): void {
    const group = new THREE.Group();
    const color = STRUCTURE_COLORS[structure.type] || 0xffffff;
    const height = STRUCTURE_HEX_HEIGHT[structure.type] || 0.1;

    // Main structure
    const geometry = new THREE.BoxGeometry(0.6, height, 0.6);
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.6,
      metalness: 0.2,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = height / 2;
    mesh.castShadow = true;
    group.add(mesh);

    // Roof detail
    if (structure.type !== "road") {
      const roofGeometry = new THREE.ConeGeometry(0.5, 0.3, 4);
      const roofMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a3728,
        roughness: 0.9,
      });
      const roof = new THREE.Mesh(roofGeometry, roofMaterial);
      roof.position.y = height + 0.15;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      group.add(roof);
    }

    // Position at first hex
    if (structure.hexes.length > 0) {
      const pos = this.hexToWorld(
        structure.hexes[0].q,
        structure.hexes[0].r
      );
      group.position.set(pos.x, 0, pos.z);
    }

    this.scene.add(group);
    this.structureMeshes.set(`${structure.type}_${structure.owner}`, group);
  }

  private createAgentMesh(agentId: string, q: number, r: number): void {
    // Agent as a sphere with glow
    const geometry = new THREE.SphereGeometry(0.3, 16, 16);
    const material = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x004444,
      emissiveIntensity: 0.5,
      roughness: 0.3,
      metalness: 0.7,
    });
    const mesh = new THREE.Mesh(geometry, material);

    const pos = this.hexToWorld(q, r);
    mesh.position.set(pos.x, 1.2, pos.z);
    mesh.castShadow = true;

    this.scene.add(mesh);
    this.agentMeshes.set(agentId, mesh);
  }

  public startAnimation(): void {
    if (this.isAnimating) return;
    this.isAnimating = true;
    this.animate();
  }

  public stopAnimation(): void {
    this.isAnimating = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }

  private animate = (): void => {
    if (!this.isAnimating) return;
    this.animationId = requestAnimationFrame(this.animate);

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private onResize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private hexToWorld(q: number, r: number): { x: number; z: number } {
    const x = Math.sqrt(3) * (q + r / 2);
    const z = (3 / 2) * r;
    return { x: x * 1.8, z: z * 1.8 }; // Scale factor
  }

  private fitCameraToHexes(hexes: HexTile3D[]): void {
    if (hexes.length === 0) return;

    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (const hex of hexes) {
      const pos = this.hexToWorld(hex.q, hex.r);
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x);
      minZ = Math.min(minZ, pos.z);
      maxZ = Math.max(maxZ, pos.z);
    }

    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const span = Math.max(maxX - minX, maxZ - minZ);

    this.camera.position.set(centerX, span * 1.2, centerZ + span * 0.5);
    this.controls.target.set(centerX, 0, centerZ);
    this.controls.update();
  }

  public dispose(): void {
    this.stopAnimation();
    window.removeEventListener("resize", this.onResize.bind(this));
    this.clearMeshes();
    this.renderer.dispose();
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  public takeScreenshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }
}

export default NexusMap3D;
