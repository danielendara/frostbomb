import * as THREE from "three";

export interface RenderPipeline {
  render: (delta?: number) => void;
  setSize: (width: number, height: number) => void;
  dispose: () => void;
}

export class PostprocessingPipeline implements RenderPipeline {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private currentComposer: RenderPipeline;
  private isLoaded = false;
  private isLoading = false;
  private isRequested = false;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.currentComposer = {
      render: () => this.renderer.render(this.scene, this.camera),
      setSize: () => {},
      dispose: () => {},
    };
  }

  public render(delta?: number): void {
    this.currentComposer.render(delta);
  }

  public setSize(width: number, height: number): void {
    this.currentComposer.setSize(width, height);
  }

  public dispose(): void {
    this.currentComposer.dispose();
  }

  public requestLoad(prefersReducedMotion: boolean): void {
    if (this.isRequested || this.isLoaded || this.isLoading || prefersReducedMotion) return;
    this.isRequested = true;
    window.setTimeout(() => {
      this.load(prefersReducedMotion);
    }, 0);
  }

  public async load(prefersReducedMotion: boolean): Promise<void> {
    if (this.isLoaded || this.isLoading || prefersReducedMotion) return;
    this.isLoading = true;

    try {
      const {
        EffectComposer,
        EffectPass,
        RenderPass,
        BloomEffect,
        SMAAEffect,
        SMAAPreset,
      } = await import("postprocessing");

      if (prefersReducedMotion) return;

      const nextComposer = new EffectComposer(this.renderer);
      nextComposer.addPass(new RenderPass(this.scene, this.camera));

      const bloomEffect = new BloomEffect({
        intensity: 1.1,
        luminanceThreshold: 0.55,
        luminanceSmoothing: 0.3,
        mipmapBlur: true,
        radius: 0.75,
      });

      const smaaEffect = new SMAAEffect({ preset: SMAAPreset.HIGH });

      nextComposer.addPass(new EffectPass(this.camera, bloomEffect));
      nextComposer.addPass(new EffectPass(this.camera, smaaEffect));
      nextComposer.setSize(window.innerWidth, window.innerHeight);

      this.currentComposer.dispose();
      this.currentComposer = nextComposer;
      this.isLoaded = true;
    } finally {
      this.isLoading = false;
    }
  }
}
