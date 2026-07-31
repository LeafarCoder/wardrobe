import "./product-stage.css";

export function ProductStage({
  as: Component = "div",
  children,
  className = "",
  interactive = false,
  animated = false,
  staticStage = false,
  transparency = false,
  ...props
}) {
  const classes = [
    "product-stage",
    interactive && "product-stage--interactive",
    animated && "product-stage--animated",
    staticStage && "product-stage--static",
    transparency && "product-stage--transparency",
    className,
  ].filter(Boolean).join(" ");

  return (
    <Component className={classes} {...props}>
      <span className="product-stage__light" aria-hidden="true" />
      <span className="product-stage__waves" aria-hidden="true" />
      <span className="product-stage__ground" aria-hidden="true" />
      <span className="product-stage__content">{children}</span>
    </Component>
  );
}
