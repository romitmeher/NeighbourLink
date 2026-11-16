export default function CommunityFaces() {
  return (
    <div className="community-faces" aria-label="Illustrative portraits of Indian neighbours">
      <div className="community-face-stack" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <img key={index} src={`/community-portraits/neighbour-${index + 1}.png`} alt="" loading="lazy" />
        ))}
      </div>
      <span>Meet the neighbourhood <small>Illustrative community portraits</small></span>
    </div>
  )
}
