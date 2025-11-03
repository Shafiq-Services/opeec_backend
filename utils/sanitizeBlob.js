module.exports.sanitizeBlobName = (name) => {
    // Split the original name into parts (filename and extension)
    const parts = name.split(".");
  
    // Sanitize the filename part (replace invalid characters with underscores)
    const sanitizedFilename = parts[0].replace(/[^a-zA-Z0-9-_.]/g, "_");
  
    // Reconstruct the sanitized name with the extension (if it exists)
    const sanitizedName =
      parts.length > 1
        ? `${sanitizedFilename}.${parts[parts.length - 1]}`
        : sanitizedFilename;
  
    return sanitizedName.substring(0, Math.min(sanitizedName.length, 1024));
  };
  